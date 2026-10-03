/**
 * The pictures nothing points at any more.
 *
 * A picture pasted into a todo is uploaded the moment it is pasted, and the
 * todo only holds the link — `![shot](/media/12)` — in its text. Delete the
 * line and the file is still there, with an id, taking up room, and reachable
 * from nowhere in the app. The same happens to a note whose words are
 * rewritten, a person whose photo was replaced by hand, a draft never saved.
 *
 * Derived, like the notebooks album: a picture is unused when no album holds
 * it, no person, notebook or recipe wears it, and no writing mentions it. The
 * writing is read wider than `pictureReferrers` reads it — goal notes and a
 * recipe's method can carry a link typed by hand — because the cost of the two
 * mistakes is not the same: a picture wrongly called used sits here unlisted,
 * while one wrongly called unused is offered for deleting.
 */
import { and, eq, inArray, isNotNull, like } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import {
	albumMedia,
	diaryEntries,
	goals,
	ideas,
	inventoryItems,
	media,
	notebooks,
	people,
	recipeImages,
	recipes,
	todoTasks
} from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import type { AlbumPicture } from './gallery.js';
import { IMAGE_MIME_PREFIX } from './media-kind.js';
import { picturesById, picturesMentionedIn } from './notebook-media.js';

/** Where the unused pictures live in the gallery. One constant for the route, the tile and the test. */
export const UNUSED_ALBUM_SLUG = 'unused';

const isPicture = like(media.mime, `${IMAGE_MIME_PREFIX}%`);

/** Every picture id something of this account's still points at. */
function usedPictureIds(ctx: Ctx): Set<number> {
	const used = new Set<number>();
	const add = (ids: (number | null)[]) => {
		for (const id of ids) if (id !== null) used.add(id);
	};

	add(
		db
			.select({ id: albumMedia.mediaId })
			.from(albumMedia)
			.where(eq(albumMedia.userId, ctx.userId))
			.all()
			.map((row) => row.id)
	);
	add(
		db
			.select({ id: recipeImages.mediaId })
			.from(recipeImages)
			.where(eq(recipeImages.userId, ctx.userId))
			.all()
			.map((row) => row.id)
	);
	add(
		db
			.select({ id: people.pictureId })
			.from(people)
			.where(and(eq(people.userId, ctx.userId), isNotNull(people.pictureId)))
			.all()
			.map((row) => row.id)
	);
	add(
		db
			.select({ id: inventoryItems.pictureId })
			.from(inventoryItems)
			.where(and(eq(inventoryItems.userId, ctx.userId), isNotNull(inventoryItems.pictureId)))
			.all()
			.map((row) => row.id)
	);
	add(
		db
			.select({ id: notebooks.pictureId })
			.from(notebooks)
			.where(and(eq(notebooks.userId, ctx.userId), isNotNull(notebooks.pictureId)))
			.all()
			.map((row) => row.id)
	);

	const written = [
		...db
			.select({ text: diaryEntries.content })
			.from(diaryEntries)
			.where(and(eq(diaryEntries.userId, ctx.userId), like(diaryEntries.content, '%/media/%')))
			.all(),
		...db
			.select({ text: ideas.content })
			.from(ideas)
			.where(and(eq(ideas.userId, ctx.userId), like(ideas.content, '%/media/%')))
			.all(),
		...db
			.select({ text: todoTasks.notes })
			.from(todoTasks)
			.where(and(eq(todoTasks.userId, ctx.userId), like(todoTasks.notes, '%/media/%')))
			.all(),
		...db
			.select({ text: goals.notes })
			.from(goals)
			.where(and(eq(goals.userId, ctx.userId), like(goals.notes, '%/media/%')))
			.all(),
		...db
			.select({ text: recipes.method })
			.from(recipes)
			.where(and(eq(recipes.userId, ctx.userId), like(recipes.method, '%/media/%')))
			.all(),
		...db
			.select({ text: recipes.notes })
			.from(recipes)
			.where(and(eq(recipes.userId, ctx.userId), like(recipes.notes, '%/media/%')))
			.all()
	];
	for (const { text } of written) add(picturesMentionedIn(text ?? ''));

	return used;
}

/** The ids of the unused pictures, newest first. */
function unusedPictureIds(ctx: Ctx): number[] {
	const used = usedPictureIds(ctx);
	return db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.userId, ctx.userId), isPicture))
		.all()
		.map((row) => row.id)
		.filter((id) => !used.has(id))
		.sort((a, b) => b - a);
}

/** The unused pictures, in the gallery's own shape. */
export function unusedPictures(ctx: Ctx): AlbumPicture[] {
	const ids = unusedPictureIds(ctx);
	return ids.length ? picturesById(ctx, ids) : [];
}

/** How many there are, for the tile on the gallery's index. */
export function unusedPictureCount(ctx: Ctx): number {
	return unusedPictureIds(ctx).length;
}

/**
 * Delete unused pictures, and only those.
 *
 * Asked again at the moment of deleting rather than trusted from the page: a
 * picture listed here an hour ago may have been pasted into a note since.
 * One still in use is refused and nothing is deleted, so a stale page cannot
 * take a picture out of somebody's writing.
 */
export function removeUnused(ctx: Ctx, ids: number[]): number {
	if (ids.length === 0) return 0;
	const unused = new Set(unusedPictureIds(ctx));
	if (ids.some((id) => !unused.has(id))) {
		const mine = db
			.select({ id: media.id })
			.from(media)
			.where(and(eq(media.userId, ctx.userId), inArray(media.id, ids), isPicture))
			.all();
		if (mine.length < ids.length) throw new NotFoundError({ key: 'errors.media.noSuchPicture' });
		throw new ValidationError({ key: 'errors.media.stillInUse' });
	}
	return db
		.delete(media)
		.where(and(eq(media.userId, ctx.userId), inArray(media.id, ids)))
		.run().changes;
}
