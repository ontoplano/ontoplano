/**
 * What points at a picture or a recording, and where it lives.
 *
 * The question `isReferenced` asks — *is anything still using this* — with the
 * answer kept rather than reduced to a yes. It is the same walk, and knowing
 * *which* thing refers to a file is what lets a caller be told the file is
 * theirs to read: a picture in a note belongs to the notes, so a key that may
 * read the notes may see it.
 *
 * Nothing here decides anything about permission. It reports where a file is
 * used; `$lib/server/api/media-access.ts` turns that into a yes or a no, and
 * this file stays portable so the routes that use it still compile into the
 * device's worker.
 */
import { and, eq, like, or } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import {
	albumMedia,
	diaryEntries,
	ideas,
	people,
	recipeImages,
	todoTasks
} from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';

/**
 * The kinds of thing that can hold a file, named for the room a person would
 * say it was in rather than for the table it is stored in.
 */
export type ReferrerKind = 'note' | 'idea' | 'todo' | 'person' | 'recipe' | 'album';

export type Referrer = {
	kind: ReferrerKind;
	id: number;
	/**
	 * The notebook it sits in, where that means anything.
	 *
	 * Null for a thing that lives in no notebook, and absent in spirit for the
	 * kinds that cannot be in one at all. A key confined to one notebook is
	 * allowed exactly the files whose referrer names that notebook.
	 */
	notebookId: number | null;
};

/**
 * Bounded on both sides, so `/media/1` is not found inside `/media/17`.
 *
 * The markdown this app writes always closes the link — `![x](/media/12)` and
 * `[x](/media/audio/40)` — so the parenthesis is the boundary. The two looser
 * patterns beside it are for writing from before that was true, where the id
 * could end a line or be followed by a space.
 */
function mentions(column: Parameters<typeof like>[0], path: string) {
	return or(like(column, `%(${path})%`), like(column, `%${path} %`), like(column, `%${path}`));
}

/** Everything of this account's that points at the picture with this id. */
export function pictureReferrers(ctx: Ctx, id: number): Referrer[] {
	const path = `/media/${id}`;
	const found: Referrer[] = [];

	for (const row of db
		.select({ id: diaryEntries.id, notebookId: diaryEntries.notebookId })
		.from(diaryEntries)
		.where(and(eq(diaryEntries.userId, ctx.userId), mentions(diaryEntries.content, path)))
		.all())
		found.push({ kind: 'note', id: row.id, notebookId: row.notebookId });

	for (const row of db
		.select({ id: people.id })
		.from(people)
		.where(and(eq(people.userId, ctx.userId), eq(people.pictureId, id)))
		.all())
		found.push({ kind: 'person', id: row.id, notebookId: null });

	for (const row of db
		.select({ id: recipeImages.recipeId })
		.from(recipeImages)
		.where(and(eq(recipeImages.userId, ctx.userId), eq(recipeImages.mediaId, id)))
		.all())
		found.push({ kind: 'recipe', id: row.id, notebookId: null });

	for (const row of db
		.select({ id: albumMedia.albumId })
		.from(albumMedia)
		.where(and(eq(albumMedia.userId, ctx.userId), eq(albumMedia.mediaId, id)))
		.all())
		found.push({ kind: 'album', id: row.id, notebookId: null });

	return found;
}

/** Everything of this account's that points at the recording with this id. */
export function recordingReferrers(ctx: Ctx, id: number): Referrer[] {
	const path = `/media/audio/${id}`;
	const found: Referrer[] = [];

	for (const row of db
		.select({ id: diaryEntries.id, notebookId: diaryEntries.notebookId })
		.from(diaryEntries)
		.where(and(eq(diaryEntries.userId, ctx.userId), mentions(diaryEntries.content, path)))
		.all())
		found.push({ kind: 'note', id: row.id, notebookId: row.notebookId });

	for (const row of db
		.select({ id: ideas.id })
		.from(ideas)
		.where(and(eq(ideas.userId, ctx.userId), mentions(ideas.content, path)))
		.all())
		found.push({ kind: 'idea', id: row.id, notebookId: null });

	for (const row of db
		.select({ id: todoTasks.id, notebookId: todoTasks.notebookId })
		.from(todoTasks)
		.where(and(eq(todoTasks.userId, ctx.userId), mentions(todoTasks.notes, path)))
		.all())
		found.push({ kind: 'todo', id: row.id, notebookId: row.notebookId });

	return found;
}
