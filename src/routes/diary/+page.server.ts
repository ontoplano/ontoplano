import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { diaryEntries, tags, diaryEntryTags } from '$lib/server/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';
import {
	parseTags,
	ensureTagIds,
	linkDiaryTags,
	replaceDiaryTags,
	cleanupOrphanTags
} from '$lib/server/tags';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	const entries = db
		.select({
			id: diaryEntries.id,
			content: diaryEntries.content,
			createdAt: diaryEntries.createdAt,
			updatedAt: diaryEntries.updatedAt
		})
		.from(diaryEntries)
		.where(eq(diaryEntries.userId, userId))
		.orderBy(desc(diaryEntries.createdAt))
		.all();

	const entriesWithTags = entries.map((entry) => {
		const entryTags = db
			.select({ id: tags.id, name: tags.name })
			.from(diaryEntryTags)
			.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
			.where(and(eq(diaryEntryTags.entryId, entry.id), eq(tags.userId, userId)))
			.all();
		return { ...entry, tags: entryTags };
	});

	const allTags = db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name).all();

	return { entries: entriesWithTags, allTags };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!content) return fail(400, { message: 'Content is required' });

		const result = db.insert(diaryEntries).values({ userId, content }).run();
		const entryId = Number(result.lastInsertRowid);

		const tagNames = parseTags(rawTags);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames, userId);
			linkDiaryTags(entryId, tagIds);
		}

		return { success: true };
	},

	createWins: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		const wins: string[] = [];
		for (let i = 0; ; i++) {
			const val = formData.get(`win_${i}`)?.toString()?.trim();
			if (val === undefined || val === null) break;
			if (val) wins.push(val);
		}

		if (wins.length === 0) return fail(400, { message: 'At least one win is required' });

		const content = wins.map((w, i) => `Win ${i + 1}: ${w}`).join('\n');

		const result = db.insert(diaryEntries).values({ userId, content }).run();
		const entryId = Number(result.lastInsertRowid);

		const userTags = parseTags(rawTags);
		const allTagNames = ['3w', ...userTags.filter((t) => t !== '3w')];
		const tagIds = ensureTagIds(allTagNames, userId);
		linkDiaryTags(entryId, tagIds);

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const content = formData.get('content')?.toString()?.trim();
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!id || !content) return fail(400, { message: 'Missing fields' });
		const existing = db
			.select({ id: diaryEntries.id })
			.from(diaryEntries)
			.where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Entry not found' });

		db.update(diaryEntries)
			.set({ content, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
			.run();

		replaceDiaryTags(id, parseTags(rawTags), userId);
		cleanupOrphanTags(userId);

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(diaryEntries)
			.where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
			.run();

		cleanupOrphanTags(userId);

		return { success: true };
	}
};
