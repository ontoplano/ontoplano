import { db } from '$lib/server/db';
import { tags, diaryEntryTags, ideaTags } from '$lib/server/db/schema';
import { eq, and, notInArray } from 'drizzle-orm';

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

export function linkDiaryTags(entryId: number, tagIds: number[]): void {
	for (const tagId of tagIds) {
		db.insert(diaryEntryTags).values({ entryId, tagId }).run();
	}
}

export function replaceDiaryTags(entryId: number, tagNames: string[], userId: string): void {
	db.delete(diaryEntryTags).where(eq(diaryEntryTags.entryId, entryId)).run();
	if (tagNames.length > 0) {
		const tagIds = ensureTagIds(tagNames, userId);
		linkDiaryTags(entryId, tagIds);
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

export function linkIdeaTags(ideaId: number, tagIds: number[]): void {
	for (const tagId of tagIds) {
		db.insert(ideaTags).values({ ideaId, tagId }).run();
	}
}

export function replaceIdeaTags(ideaId: number, tagNames: string[], userId: string): void {
	db.delete(ideaTags).where(eq(ideaTags.ideaId, ideaId)).run();
	if (tagNames.length > 0) {
		const tagIds = ensureTagIds(tagNames, userId);
		linkIdeaTags(ideaId, tagIds);
	}
}
