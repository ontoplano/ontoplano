/**
 * Albums: lists of references over the one media table.
 *
 * A picture lives once in `media`, deduplicated by hash; an album holds
 * membership rows. Putting a picture in a second album is a second row —
 * "duplicating" a photo never copies bytes, which is why it is cheap and
 * why removing it from one album leaves the other untouched. A picture
 * whose last reference goes is deleted with it: the gallery never leaves
 * invisible bytes behind on somebody's instance.
 *
 * Lives on the server because the bytes do; the self-contained instance
 * gains the gallery when media does.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { albumMedia, albums, media, mediaTags, tags } from '$lib/db/schema.js';
import { replaceMediaTags } from '$lib/services/tags.js';
import type { Ctx } from '$lib/services/ctx.js';
import { stamp, stamps } from '$lib/services/time.js';
import { ConflictError, NotFoundError, ValidationError } from '$lib/services/errors.js';
import { str } from '$lib/services/validate.js';
import { mediaLimits, removeIfUnreferenced, store } from './media.js';

export const MAX_ALBUM_NAME_LENGTH = 120;

export type Album = {
	id: number;
	name: string;
	count: number;
	/** The newest picture, for the album card. Null while it is empty. */
	coverId: number | null;
};

export type AlbumPicture = {
	id: number;
	alt: string;
	filename: string;
	addedAt: string;
	tags: string[];
	/** Every album holding this picture, for "also in". */
	albums: { id: number; name: string }[];
};

export function listAlbums(ctx: Ctx): Album[] {
	const rows = db
		.select()
		.from(albums)
		.where(eq(albums.userId, ctx.userId))
		.orderBy(asc(albums.sortOrder), asc(albums.id))
		.all();
	const memberships = db
		.select({ albumId: albumMedia.albumId, mediaId: albumMedia.mediaId, id: albumMedia.id })
		.from(albumMedia)
		.where(eq(albumMedia.userId, ctx.userId))
		.orderBy(desc(albumMedia.id))
		.all();
	return rows.map((a) => {
		const mine = memberships.filter((m) => m.albumId === a.id);
		return { id: a.id, name: a.name, count: mine.length, coverId: mine[0]?.mediaId ?? null };
	});
}

function ownedAlbum(ctx: Ctx, id: number) {
	const found = db
		.select()
		.from(albums)
		.where(and(eq(albums.id, id), eq(albums.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('album');
	return found;
}

export function createAlbum(ctx: Ctx, input: { name: unknown }): Album {
	const name = str(input.name, 'name', { max: MAX_ALBUM_NAME_LENGTH });
	const limit = mediaLimits().galleryAlbums;
	const existing = listAlbums(ctx);
	if (existing.length >= limit)
		throw new ValidationError(`This instance keeps at most ${limit} albums.`);
	if (existing.some((a) => a.name === name))
		throw new ConflictError('An album by that name already exists.');
	const inserted = db
		.insert(albums)
		.values({ userId: ctx.userId, name, sortOrder: existing.length, ...stamps(ctx) })
		.returning({ id: albums.id })
		.get();
	return { id: inserted.id, name, count: 0, coverId: null };
}

export function renameAlbum(ctx: Ctx, id: number, input: { name: unknown }): void {
	ownedAlbum(ctx, id);
	const name = str(input.name, 'name', { max: MAX_ALBUM_NAME_LENGTH });
	db.update(albums)
		.set({ name, updatedAt: stamp(ctx) })
		.where(and(eq(albums.id, id), eq(albums.userId, ctx.userId)))
		.run();
}

/**
 * Deleting an album lets go of its references, and any picture that was
 * only there goes with them — bytes nobody can see are not kept.
 */
export function deleteAlbum(ctx: Ctx, id: number): void {
	ownedAlbum(ctx, id);
	const held = db
		.select({ mediaId: albumMedia.mediaId })
		.from(albumMedia)
		.where(and(eq(albumMedia.albumId, id), eq(albumMedia.userId, ctx.userId)))
		.all()
		.map((r) => r.mediaId);
	db.delete(albums)
		.where(and(eq(albums.id, id), eq(albums.userId, ctx.userId)))
		.run();
	for (const mediaId of held) removeIfUnreferenced(ctx, mediaId);
}

export function albumPictures(ctx: Ctx, albumId: number): AlbumPicture[] {
	ownedAlbum(ctx, albumId);
	const members = db
		.select({ mediaId: albumMedia.mediaId, addedAt: albumMedia.addedAt })
		.from(albumMedia)
		.where(and(eq(albumMedia.albumId, albumId), eq(albumMedia.userId, ctx.userId)))
		.orderBy(desc(albumMedia.id))
		.all();
	if (members.length === 0) return [];
	const ids = members.map((m) => m.mediaId);

	const pictures = db
		.select({ id: media.id, alt: media.alt, filename: media.filename })
		.from(media)
		.where(and(eq(media.userId, ctx.userId), inArray(media.id, ids)))
		.all();

	const tagRows = db
		.select({ mediaId: mediaTags.mediaId, name: tags.name })
		.from(mediaTags)
		.innerJoin(tags, eq(mediaTags.tagId, tags.id))
		.where(and(eq(mediaTags.userId, ctx.userId), inArray(mediaTags.mediaId, ids)))
		.all();

	const elsewhere = db
		.select({ mediaId: albumMedia.mediaId, albumId: albums.id, name: albums.name })
		.from(albumMedia)
		.innerJoin(albums, eq(albumMedia.albumId, albums.id))
		.where(and(eq(albumMedia.userId, ctx.userId), inArray(albumMedia.mediaId, ids)))
		.all();

	return members.flatMap((m) => {
		const p = pictures.find((x) => x.id === m.mediaId);
		if (!p) return [];
		return [
			{
				id: p.id,
				alt: p.alt,
				filename: p.filename,
				addedAt: m.addedAt,
				tags: tagRows
					.filter((t) => t.mediaId === p.id)
					.map((t) => t.name)
					.sort(),
				albums: elsewhere
					.filter((e) => e.mediaId === p.id)
					.map((e) => ({ id: e.albumId, name: e.name }))
			}
		];
	});
}

function assertRoom(ctx: Ctx, albumId: number): void {
	const limit = mediaLimits().albumImages;
	const count = db
		.select({ id: albumMedia.id })
		.from(albumMedia)
		.where(and(eq(albumMedia.albumId, albumId), eq(albumMedia.userId, ctx.userId)))
		.all().length;
	if (count >= limit)
		throw new ValidationError(`This instance keeps at most ${limit} pictures per album.`);
}

/** A new picture, straight into an album. */
export function uploadToAlbum(
	ctx: Ctx,
	albumId: number,
	input: { bytes: Buffer; filename?: string; alt?: string }
): number {
	ownedAlbum(ctx, albumId);
	assertRoom(ctx, albumId);
	const picture = store(ctx, input);
	db.insert(albumMedia)
		.values({ userId: ctx.userId, albumId, mediaId: picture.id, addedAt: stamp(ctx) })
		.onConflictDoNothing()
		.run();
	return picture.id;
}

/**
 * The reference duplicate: the same picture, now in another album too.
 * Idempotent — an album holds a picture once.
 */
export function addToAlbum(ctx: Ctx, albumId: number, mediaId: number): void {
	ownedAlbum(ctx, albumId);
	const owned = db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.id, mediaId), eq(media.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('picture');
	assertRoom(ctx, albumId);
	db.insert(albumMedia)
		.values({ userId: ctx.userId, albumId, mediaId, addedAt: stamp(ctx) })
		.onConflictDoNothing()
		.run();
}

/**
 * Out of this album; gone entirely if this was its last reference anywhere.
 */
export function removeFromAlbum(ctx: Ctx, albumId: number, mediaId: number): void {
	ownedAlbum(ctx, albumId);
	const gone = db
		.delete(albumMedia)
		.where(
			and(
				eq(albumMedia.albumId, albumId),
				eq(albumMedia.mediaId, mediaId),
				eq(albumMedia.userId, ctx.userId)
			)
		)
		.run();
	if (gone.changes === 0) throw new NotFoundError('picture');
	removeIfUnreferenced(ctx, mediaId);
}

/** Move: out of one album, into another, one gesture. */
export function moveBetweenAlbums(ctx: Ctx, from: number, to: number, mediaId: number): void {
	addToAlbum(ctx, to, mediaId);
	if (from !== to)
		db.delete(albumMedia)
			.where(
				and(
					eq(albumMedia.albumId, from),
					eq(albumMedia.mediaId, mediaId),
					eq(albumMedia.userId, ctx.userId)
				)
			)
			.run();
}

export function tagPicture(ctx: Ctx, mediaId: number, raw: unknown): void {
	const owned = db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.id, mediaId), eq(media.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('picture');
	const names = String(raw ?? '')
		.slice(0, 500)
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	replaceMediaTags(mediaId, names, ctx.userId);
}
