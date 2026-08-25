import { db } from '$lib/server/db';
import { tags, diaryEntryTags, ideaTags } from '$lib/server/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';

/**
 * Tags, and the rows that join them to what they tag.
 *
 * Every statement here carries the account in its own `WHERE` (I1). The join
 * tables used to have no `user_id` at all, so "delete this entry's tags" was a
 * statement scoped by an id that arrived from a form — correct only for as long
 * as the caller remembered to check first.
 */

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

	const referencedIds = [...new Set([...diaryRefIds, ...ideaRefIds])];

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
