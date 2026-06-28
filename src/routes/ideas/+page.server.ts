import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { ideas, tags, ideaTags } from '$lib/server/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';
import {
	parseTags,
	ensureTagIds,
	linkIdeaTags,
	replaceIdeaTags,
	cleanupOrphanTags
} from '$lib/server/tags';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	const allIdeas = db
		.select({
			id: ideas.id,
			content: ideas.content,
			createdAt: ideas.createdAt,
			updatedAt: ideas.updatedAt
		})
		.from(ideas)
		.where(eq(ideas.userId, userId))
		.orderBy(desc(ideas.createdAt))
		.all();

	const ideasWithTags = allIdeas.map((idea) => {
		const ideaTagList = db
			.select({ id: tags.id, name: tags.name })
			.from(ideaTags)
			.innerJoin(tags, eq(ideaTags.tagId, tags.id))
			.where(and(eq(ideaTags.ideaId, idea.id), eq(tags.userId, userId)))
			.all();
		return { ...idea, tags: ideaTagList };
	});

	const allTags = db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name).all();

	return { ideas: ideasWithTags, allTags };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!content) return fail(400, { message: 'Content is required' });

		const now = toLocalISOString(new Date());
		const result = db.insert(ideas).values({ userId, content, createdAt: now, updatedAt: now }).run();
		const ideaId = Number(result.lastInsertRowid);

		const tagNames = parseTags(rawTags);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames, userId);
			linkIdeaTags(ideaId, tagIds);
		}

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
			.select({ id: ideas.id })
			.from(ideas)
			.where(and(eq(ideas.id, id), eq(ideas.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Idea not found' });

		db.update(ideas)
			.set({ content, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(ideas.id, id), eq(ideas.userId, userId)))
			.run();

		replaceIdeaTags(id, parseTags(rawTags), userId);
		cleanupOrphanTags(userId);

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(ideas)
			.where(and(eq(ideas.id, id), eq(ideas.userId, userId)))
			.run();

		cleanupOrphanTags(userId);

		return { success: true };
	}
};
