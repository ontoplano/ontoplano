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
import { parseTags, replaceMediaTags } from '$lib/services/tags.js';
import type { Ctx } from '$lib/services/ctx.js';
import { stamp, stamps } from '$lib/services/time.js';
import { ConflictError, NotFoundError, ValidationError } from '$lib/services/errors.js';
import { str } from '$lib/services/validate.js';
import {
	ACCEPTED_EXTENSIONS,
	bytesStored,
	mediaLimits,
	removeIfUnreferenced,
	store
} from './media.js';

export const MAX_ALBUM_NAME_LENGTH = 120;
/**
 * How much of one folder's name survives into the album's.
 *
 * A folder name is a string from somebody's disk, and a deep tree of long
 * ones would exceed what an album may be called. Per segment rather than on
 * the joined name, so a long folder deep down does not eat the names above
 * it.
 */
export const MAX_ALBUM_SEGMENT_LENGTH = 60;

export type Album = {
	id: number;
	name: string;
	count: number;
	/** The newest picture, for the album card. Null while it is empty. */
	coverId: number | null;
	/** This album's pictures plus everything under it, set by `albumTree`. */
	totalCount?: number;
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

/**
 * How an album's name says where it belongs.
 *
 * A folder import writes `birds — Falconiformes`, which is a name and a
 * lineage at once. Rather than a parent column that the import would have to
 * keep in step, the separator IS the relationship: split it and the flat
 * list is a tree. It also means somebody who renames an album to
 * `birds — Owls` has moved it, which is the behaviour they would expect
 * from typing that.
 */
export const ALBUM_SEPARATOR = ' — ';

/**
 * The album a chosen file belongs in, from the path the browser sent.
 *
 * `webkitRelativePath` looks like a path but it is a string the client
 * wrote, and this is where it stops being one: the segments are split off,
 * `.` and `..` are dropped rather than resolved, separators and control
 * characters are removed, and the em-dash this module uses to mean "inside"
 * is taken out of each segment so a folder literally called `a — b` names
 * one album rather than forging two levels. Nothing here ever reaches a
 * filesystem — the bytes are a column — but a name that still looks like a
 * path invites somebody later to treat it as one.
 *
 * Too deep or too long lands in the nearest ancestor that fits, because an
 * import that refuses a photograph over the length of a folder name is worse
 * than one that files it a level up.
 */
export function albumNameFor(path: string, under?: string): string {
	const clean = (raw: string) =>
		raw
			.replace(/[\\/]/g, ' ')
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f]/g, '')
			.replace(/[—–]/g, '-')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, MAX_ALBUM_SEGMENT_LENGTH);

	const folders = String(path)
		.split('/')
		.map(clean)
		.filter((part) => part && part !== '.' && part !== '..');
	// The last segment is the file itself, not a folder.
	folders.pop();

	const parts = [...(under ? [clean(under)] : []), ...folders].filter(Boolean);
	while (parts.length > 1 && parts.join(ALBUM_SEPARATOR).length > MAX_ALBUM_NAME_LENGTH)
		parts.pop();

	return parts.join(ALBUM_SEPARATOR).slice(0, MAX_ALBUM_NAME_LENGTH) || 'Imported';
}

/** Does this name claim to be one of the formats taken here? */
function looksLikePicture(path: string): boolean {
	const extension = path.split('.').pop()?.toLowerCase() ?? '';
	return ACCEPTED_EXTENSIONS.includes(extension);
}

export type AlbumNode = Album & { depth: number; children: AlbumNode[] };

/** The albums as they belong to each other, roots first. */
export function albumTree(ctx: Ctx): AlbumNode[] {
	const flat = listAlbums(ctx);
	const nodes = new Map<string, AlbumNode>(
		flat.map((a) => [
			a.name,
			{ ...a, depth: a.name.split(ALBUM_SEPARATOR).length - 1, children: [] }
		])
	);

	const roots: AlbumNode[] = [];
	for (const node of nodes.values()) {
		const parts = node.name.split(ALBUM_SEPARATOR);
		parts.pop();
		// The nearest ancestor that actually exists: an album named
		// `a — b — c` with no `a — b` hangs off `a` rather than off nothing.
		let parent: AlbumNode | undefined;
		while (parts.length > 0 && !parent) {
			parent = nodes.get(parts.join(ALBUM_SEPARATOR));
			parts.pop();
		}
		if (parent) parent.children.push(node);
		else roots.push(node);
	}

	// What a parent holds includes what its children hold: a root album with
	// its pictures in subfolders was reading "0", which is true of the album
	// and false of the thing somebody is looking at.
	const withTotals = (node: AlbumNode): number => {
		const total = node.children.reduce((n, child) => n + withTotals(child), node.count);
		node.totalCount = total;
		return total;
	};
	roots.forEach(withTotals);
	return roots;
}

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
 * A folder of pictures, as albums.
 *
 * The browser hands over a whole tree with each file's path inside it, and
 * this files each one into the album its folder names: `Birds/Herons/a.jpg`
 * becomes the album "Birds — Herons". Nested rather than flattened, because
 * somebody who sorted their pictures into folders meant that sorting; joined
 * with an em dash rather than made into folders of albums, because an album
 * holding albums is a folder, and the gallery deliberately has none.
 *
 * Everything is deduplicated as it always is: the same picture twice is one
 * row and two memberships, so a tree with copies costs its bytes once.
 */
export type FolderPlan = {
	/** Where each file would land, and whether it would. */
	files: {
		path: string;
		album: string;
		bytes: number;
		ok: boolean;
		/** Said in the person's words, with the instance's own number in it. */
		refusedBecause?: string;
	}[];
	albums: string[];
	/** The instance's ceiling, so the screen can name it rather than imply it. */
	maxKilobytes: number;
	/** How many files one import may carry, and how much one request may. */
	maxFiles: number;
	batchBytes: number;
	willImport: number;
	willRefuse: number;
};

/**
 * What an import would do, before it does any of it.
 *
 * A folder of two hundred photographs is exactly the case where "18 in, 10
 * refused" after the fact is useless: by then the ten are lost in a number
 * and nobody knows which. So the browser reads the names and sizes, this
 * says what would happen to each, and the import proper only runs on a
 * second press.
 *
 * Names and sizes, never the bytes, so looking at a folder costs one small
 * request instead of the whole folder going up twice — and every ceiling the
 * import will be judged against is counted here, so "will import" means it.
 */
export function planFolder(
	ctx: Ctx,
	files: { path: string; bytes: number }[],
	opts: { under?: string } = {}
): FolderPlan {
	const limits = mediaLimits();
	const albums = new Set<string>();

	// What the account has already spent, and what each album already holds:
	// the ceilings the import will actually be judged against. Counted here
	// too, so the preview promises what happens rather than the happy case.
	let bytesLeft = limits.accountBytes - bytesStored(ctx);
	const existing = listAlbums(ctx);
	const held = new Map(existing.map((a) => [a.name, a.count]));
	let albumsLeft = limits.galleryAlbums - existing.length;

	/*
	 * Why this file would not land, in the order the import would find out.
	 * The first true one is the reason given, because that is the one the
	 * person has to act on.
	 */
	const refusalFor = (file: { path: string; bytes: number }, album: string, index: number) => {
		if (!looksLikePicture(file.path))
			return 'That is not a picture this instance takes — JPEG, PNG, GIF or WebP.';
		if (file.bytes === 0) return 'That file is empty.';
		if (file.bytes > limits.maxBytes)
			return `Pictures here are at most ${limits.maxKilobytes}KB, and that one is ${Math.ceil(
				file.bytes / 1024
			)}KB.`;
		if (index >= limits.importFiles)
			return `One import takes ${limits.importFiles} files, and this folder has more.`;
		if (file.bytes > bytesLeft)
			return `Your pictures would go over this instance's ${limits.accountMegabytes}MB.`;
		if (!held.has(album) && albumsLeft <= 0)
			return `This instance keeps ${limits.galleryAlbums} albums, and that is all of them.`;
		if ((held.get(album) ?? 0) >= limits.albumImages)
			return `An album holds ${limits.albumImages} pictures, and "${album}" is full.`;
		return undefined;
	};

	const planned = files.map((file, index) => {
		const album = albumNameFor(file.path, opts.under);
		const refusedBecause = refusalFor(file, album, index);

		if (!refusedBecause) {
			albums.add(album);
			bytesLeft -= file.bytes;
			if (!held.has(album)) albumsLeft -= 1;
			held.set(album, (held.get(album) ?? 0) + 1);
		}

		return { path: file.path, album, bytes: file.bytes, ok: !refusedBecause, refusedBecause };
	});

	return {
		files: planned,
		albums: [...albums],
		maxKilobytes: limits.maxKilobytes,
		maxFiles: limits.importFiles,
		batchBytes: limits.importBatchBytes,
		willImport: planned.filter((f) => f.ok).length,
		willRefuse: planned.filter((f) => !f.ok).length
	};
}

export function importFolder(
	ctx: Ctx,
	files: { path: string; bytes: Buffer; filename: string }[],
	opts: { under?: string } = {}
): { albums: number; pictures: number; skipped: number } {
	const made = new Map<string, number>();
	let pictures = 0;
	let skipped = 0;

	// The same ceiling the preview counted against. A batch is one request of
	// several, so this bounds what one request does, not what a whole tree
	// may be — the tree's own ceiling is the preview's.
	for (const file of files.slice(0, mediaLimits().importFiles)) {
		const name = albumNameFor(file.path, opts.under);

		try {
			let albumId = made.get(name);
			if (albumId === undefined) {
				const existing = listAlbums(ctx).find((a) => a.name === name);
				albumId = existing ? existing.id : createAlbum(ctx, { name }).id;
				made.set(name, albumId);
			}
			uploadToAlbum(ctx, albumId, { bytes: file.bytes, filename: file.filename });
			pictures += 1;
		} catch {
			// One picture too big, one album full, or no room for another album:
			// the rest of the tree still arrives, and the count says how many
			// did not. Which ones is what the preview is for.
			skipped += 1;
		}
	}

	return { albums: made.size, pictures, skipped };
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

export function renamePicture(ctx: Ctx, mediaId: number, input: { name: unknown }): void {
	const name = str(input.name, 'name', { max: 200 });
	const changed = db
		.update(media)
		.set({ filename: name })
		.where(and(eq(media.id, mediaId), eq(media.userId, ctx.userId)))
		.run();
	if (changed.changes === 0) throw new NotFoundError('picture');
}

export function tagPicture(ctx: Ctx, mediaId: number, raw: unknown): void {
	const owned = db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.id, mediaId), eq(media.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('picture');
	// The same reading the diary gives tags: commas or spaces, #-prefixes
	// dropped, lowercased, deduplicated — one habit across the whole app.
	replaceMediaTags(mediaId, parseTags(String(raw ?? '').slice(0, 500)), ctx.userId);
}
