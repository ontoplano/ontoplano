import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diaryEntries, tags, diaryEntryTags } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';

export const load: PageServerLoad = async () => {
	const entries = db
		.select({
			id: diaryEntries.id,
			content: diaryEntries.content,
			createdAt: diaryEntries.createdAt,
			updatedAt: diaryEntries.updatedAt
		})
		.from(diaryEntries)
		.orderBy(desc(diaryEntries.createdAt))
		.all();

	const entriesWithTags = entries.map((entry) => {
		const entryTags = db
			.select({ id: tags.id, name: tags.name })
			.from(diaryEntryTags)
			.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
			.where(eq(diaryEntryTags.entryId, entry.id))
			.all();
		return { ...entry, tags: entryTags };
	});

	const allTags = db.select().from(tags).orderBy(tags.name).all();

	return { entries: entriesWithTags, allTags };
};

function parseTags(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[,\s]+/)
				.map((t) => t.replace(/^#/, '').trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

function ensureTagIds(tagNames: string[]): number[] {
	return tagNames.map((name) => {
		const existing = db.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).get();
		if (existing) return existing.id;
		const result = db.insert(tags).values({ name }).run();
		return Number(result.lastInsertRowid);
	});
}

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!content) return fail(400, { message: 'Content is required' });

		const result = db.insert(diaryEntries).values({ content }).run();
		const entryId = Number(result.lastInsertRowid);

		const tagNames = parseTags(rawTags);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames);
			for (const tagId of tagIds) {
				db.insert(diaryEntryTags).values({ entryId, tagId }).run();
			}
		}

		return { success: true };
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const content = formData.get('content')?.toString()?.trim();
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!id || !content) return fail(400, { message: 'Missing fields' });

		db.update(diaryEntries)
			.set({ content, updatedAt: toLocalISOString(new Date()) })
			.where(eq(diaryEntries.id, id))
			.run();

		db.delete(diaryEntryTags).where(eq(diaryEntryTags.entryId, id)).run();
		const tagNames = parseTags(rawTags);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames);
			for (const tagId of tagIds) {
				db.insert(diaryEntryTags).values({ entryId: id, tagId }).run();
			}
		}

		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(diaryEntries).where(eq(diaryEntries.id, id)).run();

		return { success: true };
	}
};
