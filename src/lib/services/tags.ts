import { db } from '$lib/db/index.js';
import {
	tags,
	diaryEntryTags,
	exceptionalTaskTags,
	ideaTags,
	mediaTags,
	recurringTaskTags,
	todoTags
} from '$lib/db/schema';
import { eq, and, inArray, notInArray } from 'drizzle-orm';
import { ValidationError } from './errors.js';

/**
 * Tags, and the rows that join them to what they tag.
 *
 * Every statement here carries the account in its own `WHERE` (I1). The join
 * tables used to have no `user_id` at all, so "delete this entry's tags" was a
 * statement scoped by an id that arrived from a form — correct only for as long
 * as the caller remembered to check first.
 */

/** As much tag as any one thing may carry, in characters of raw input. */
export const MAX_TAGS_LENGTH = 500;

/**
 * Tag input as it arrives from a form or a tool, checked and nothing else.
 *
 * Shared rather than written per room: ideas had a private copy of this, and
 * the moment todos wanted tags too there would have been two ceilings that
 * could drift apart.
 */
export function optionalTagInput(value: unknown): string {
	if (value === undefined || value === null) return '';
	const given = String(value).trim();
	if (given.length > MAX_TAGS_LENGTH)
		throw new ValidationError('That is more tags than one thing can carry');
	return given;
}

/**
 * Normalizes raw tag input. Strips leading #, splits on commas/spaces, lowercases, dedupes.
 * All these produce ["tagfoo", "tagbar"]:
 *   "tagfoo, tagbar" | "tagfoo tagbar" | "#tagfoo #tagbar" | "#tagfoo, #tagbar"
 */
export function parseTags(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[,\s]+/)
				.map((t) => t.replace(/^#+/, '').trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

export function ensureTagIds(tagNames: string[], userId: string): number[] {
	return tagNames.map((name) => {
		const existing = db
			.select({ id: tags.id })
			.from(tags)
			.where(and(eq(tags.name, name), eq(tags.userId, userId)))
			.get();
		if (existing) return existing.id;
		const result = db.insert(tags).values({ userId, name }).run();
		return Number(result.lastInsertRowid);
	});
}

export function linkDiaryTags(entryId: number, tagIds: number[], userId: string): void {
	const now = new Date().toISOString();
	for (const tagId of tagIds) {
		db.insert(diaryEntryTags).values({ userId, entryId, tagId, taggedAt: now }).run();
	}
}

/**
 * Set a note's labels to exactly these, without forgetting when the old ones
 * went on.
 *
 * The same diff `replaceTodoTags` does, and for the same reason: deleting
 * every row and writing them back gives the same answer and a different
 * history, so a label that had been there a week came back dated today and
 * "what went into review since I last looked" became "what has been edited
 * since".
 */
export function replaceDiaryTags(entryId: number, tagNames: string[], userId: string): void {
	const wanted = new Set(tagNames.length > 0 ? ensureTagIds(tagNames, userId) : []);

	const have = db
		.select({ id: diaryEntryTags.id, tagId: diaryEntryTags.tagId })
		.from(diaryEntryTags)
		.where(and(eq(diaryEntryTags.entryId, entryId), eq(diaryEntryTags.userId, userId)))
		.all();

	const dropping = have.filter((row) => !wanted.has(row.tagId)).map((row) => row.id);
	if (dropping.length > 0) {
		db.delete(diaryEntryTags).where(inArray(diaryEntryTags.id, dropping)).run();
	}

	const already = new Set(have.map((row) => row.tagId));
	const adding = [...wanted].filter((tagId) => !already.has(tagId));
	if (adding.length > 0) linkDiaryTags(entryId, adding, userId);
}

export function cleanupOrphanTags(userId: string): void {
	const diaryRefIds = db
		.select({ tagId: diaryEntryTags.tagId })
		.from(diaryEntryTags)
		.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
		.where(eq(tags.userId, userId))
		.all()
		.map((r) => r.tagId);

	const ideaRefIds = db
		.select({ tagId: ideaTags.tagId })
		.from(ideaTags)
		.innerJoin(tags, eq(ideaTags.tagId, tags.id))
		.where(eq(tags.userId, userId))
		.all()
		.map((r) => r.tagId);

	const mediaRefIds = db
		.select({ tagId: mediaTags.tagId })
		.from(mediaTags)
		.innerJoin(tags, eq(mediaTags.tagId, tags.id))
		.where(eq(tags.userId, userId))
		.all()
		.map((r) => r.tagId);

	const todoRefIds = db
		.select({ tagId: todoTags.tagId })
		.from(todoTags)
		.innerJoin(tags, eq(todoTags.tagId, tags.id))
		.where(eq(tags.userId, userId))
		.all()
		.map((r) => r.tagId);

	const referencedIds = [
		...new Set([...diaryRefIds, ...ideaRefIds, ...mediaRefIds, ...todoRefIds])
	];

	if (referencedIds.length === 0) {
		db.delete(tags).where(eq(tags.userId, userId)).run();
	} else {
		db.delete(tags)
			.where(and(eq(tags.userId, userId), notInArray(tags.id, referencedIds)))
			.run();
	}
}

export function linkIdeaTags(ideaId: number, tagIds: number[], userId: string): void {
	for (const tagId of tagIds) {
		db.insert(ideaTags).values({ userId, ideaId, tagId }).run();
	}
}

export function replaceIdeaTags(ideaId: number, tagNames: string[], userId: string): void {
	db.delete(ideaTags)
		.where(and(eq(ideaTags.ideaId, ideaId), eq(ideaTags.userId, userId)))
		.run();

	if (tagNames.length > 0) {
		linkIdeaTags(ideaId, ensureTagIds(tagNames, userId), userId);
	}
}

/**
 * The same three verbs for a block, recurring or one-off.
 *
 * A label belonged to the dateless task only, which made it a property of one
 * shape of task rather than of a task: "everything about the move" could not
 * include the three hours booked for it. The vocabulary is the one `tags`
 * table either way — a word used on a task is the same word on a block.
 */
function blockJoin(kind: BlockKind) {
	return kind === 'recurring' ? recurringTaskTags : exceptionalTaskTags;
}

export type BlockKind = 'recurring' | 'exceptional';

/** A label and when it went on. The same shape a task's labels have. */
export type Tag = { id: number; name: string; taggedAt: string | null };

export function tagsForBlock(kind: BlockKind, taskId: number, userId: string): Tag[] {
	const join = blockJoin(kind);
	return db
		.select({ id: tags.id, name: tags.name, taggedAt: join.taggedAt })
		.from(join)
		.innerJoin(tags, eq(join.tagId, tags.id))
		.where(and(eq(join.taskId, taskId), eq(join.userId, userId)))
		.orderBy(tags.name)
		.all();
}

/** Set a block's labels to exactly these, keeping the dates of the survivors. */
export function replaceBlockTags(
	kind: BlockKind,
	taskId: number,
	tagNames: string[],
	userId: string
): void {
	const join = blockJoin(kind);
	const wanted = new Set(tagNames.length > 0 ? ensureTagIds(tagNames, userId) : []);

	const have = db
		.select({ id: join.id, tagId: join.tagId })
		.from(join)
		.where(and(eq(join.taskId, taskId), eq(join.userId, userId)))
		.all();

	const dropping = have.filter((row) => !wanted.has(row.tagId)).map((row) => row.id);
	if (dropping.length > 0) db.delete(join).where(inArray(join.id, dropping)).run();

	const already = new Set(have.map((row) => row.tagId));
	const now = new Date().toISOString();
	for (const tagId of wanted) {
		if (already.has(tagId)) continue;
		db.insert(join).values({ userId, taskId, tagId, taggedAt: now }).run();
	}
}

export function linkTodoTags(todoId: number, tagIds: number[], userId: string): void {
	const now = new Date().toISOString();
	for (const tagId of tagIds) {
		db.insert(todoTags).values({ userId, todoId, tagId, taggedAt: now }).run();
	}
}

/**
 * Set the labels to exactly these, without forgetting when the old ones went on.
 *
 * This used to delete every row and write them all back, which is the same
 * answer and a different history: a label that had been there a week came back
 * dated today, so "what was tagged since I last looked" was whatever had been
 * edited since. Now only the difference moves — the ones going away are
 * dropped, the new ones are dated, and a label that was already there is left
 * exactly as it was.
 */
export function replaceTodoTags(todoId: number, tagNames: string[], userId: string): void {
	const wanted = new Set(tagNames.length > 0 ? ensureTagIds(tagNames, userId) : []);

	const have = db
		.select({ id: todoTags.id, tagId: todoTags.tagId })
		.from(todoTags)
		.where(and(eq(todoTags.todoId, todoId), eq(todoTags.userId, userId)))
		.all();

	const dropping = have.filter((row) => !wanted.has(row.tagId)).map((row) => row.id);
	if (dropping.length > 0) {
		db.delete(todoTags).where(inArray(todoTags.id, dropping)).run();
	}

	const already = new Set(have.map((row) => row.tagId));
	const adding = [...wanted].filter((tagId) => !already.has(tagId));
	if (adding.length > 0) linkTodoTags(todoId, adding, userId);
}

export function linkMediaTags(mediaId: number, tagIds: number[], userId: string): void {
	for (const tagId of tagIds) {
		db.insert(mediaTags).values({ userId, mediaId, tagId }).run();
	}
}

export function replaceMediaTags(mediaId: number, tagNames: string[], userId: string): void {
	db.delete(mediaTags)
		.where(and(eq(mediaTags.mediaId, mediaId), eq(mediaTags.userId, userId)))
		.run();

	if (tagNames.length > 0) {
		linkMediaTags(mediaId, ensureTagIds(tagNames, userId), userId);
	}
}
