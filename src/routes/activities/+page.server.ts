import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activities, categories } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const allCategories = db.select().from(categories).all();
	const allActivities = db
		.select({
			id: activities.id,
			name: activities.name,
			categoryId: activities.categoryId,
			categoryName: categories.name,
			description: activities.description,
			color: activities.color,
			active: activities.active,
			createdAt: activities.createdAt
		})
		.from(activities)
		.leftJoin(categories, eq(activities.categoryId, categories.id))
		.orderBy(activities.name)
		.all();

	return { activities: allActivities, categories: allCategories };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const categoryId = Number(formData.get('categoryId'));
		const description = formData.get('description')?.toString()?.trim() ?? '';

		if (!name) return fail(400, { message: 'Name is required' });
		if (!categoryId) return fail(400, { message: 'Category is required' });

		db.insert(activities).values({ name, categoryId, description }).run();

		return { success: true };
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const name = formData.get('name')?.toString()?.trim();
		const categoryId = Number(formData.get('categoryId'));
		const description = formData.get('description')?.toString()?.trim() ?? '';

		if (!id || !name) return fail(400, { message: 'Missing fields' });

		db.update(activities)
			.set({
				name,
				categoryId,
				description,
				updatedAt: new Date().toISOString().slice(0, 19)
			})
			.where(eq(activities.id, id))
			.run();

		return { success: true };
	},

	toggleActive: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const active = formData.get('active') === 'true';

		if (!id) return fail(400, { message: 'Missing id' });

		db.update(activities)
			.set({ active: !active, updatedAt: new Date().toISOString().slice(0, 19) })
			.where(eq(activities.id, id))
			.run();

		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(activities).where(eq(activities.id, id)).run();

		return { success: true };
	}
};
