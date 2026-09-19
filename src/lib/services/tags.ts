import { db } from '$lib/db/index.js';
import { tags, diaryEntryTags, ideaTags, mediaTags, todoTags } from '$lib/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';
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
	for (const tagId of tagIds) {
		db.insert(diaryEntryTags).values({ userId, entryId, tagId }).run();
	}
}

export function replaceDiaryTags(entryId: number, tagNames: string[], userId: string): void {
	db.delete(diaryEntryTags)
		.where(and(eq(diaryEntryTags.entryId, entryId), eq(diaryEntryTags.userId, userId)))
		.run();

	if (tagNames.length > 0) {
		linkDiaryTags(entryId, ensureTagIds(tagNames, userId), userId);
	}
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

export function linkTodoTags(todoId: number, tagIds: number[], userId: string): void {
	for (const tagId of tagIds) {
		db.insert(todoTags).values({ userId, todoId, tagId }).run();
	}
}

export function replaceTodoTags(todoId: number, tagNames: string[], userId: string): void {
	db.delete(todoTags)
		.where(and(eq(todoTags.todoId, todoId), eq(todoTags.userId, userId)))
		.run();

	if (tagNames.length > 0) {
		linkTodoTags(todoId, ensureTagIds(tagNames, userId), userId);
	}
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
