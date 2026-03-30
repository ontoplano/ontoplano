import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activities, categories, weeklySlots, taskInstances } from '$lib/server/db/schema';
import { eq, count } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';

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

	const activitiesWithRefs = allActivities.map((a) => {
		const slotRefs = db
			.select({ cnt: count() })
			.from(weeklySlots)
			.where(eq(weeklySlots.activityId, a.id))
			.get();
		const instanceRefs = db
			.select({ cnt: count() })
			.from(taskInstances)
			.where(eq(taskInstances.resolvedActivityId, a.id))
			.get();
		return {
			...a,
			hasReferences: (slotRefs?.cnt ?? 0) > 0 || (instanceRefs?.cnt ?? 0) > 0
		};
	});

	return { activities: activitiesWithRefs, categories: allCategories };
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
				updatedAt: toLocalISOString(new Date())
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
			.set({ active: !active, updatedAt: toLocalISOString(new Date()) })
			.where(eq(activities.id, id))
			.run();

		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		const slotRefs = db
			.select({ cnt: count() })
			.from(weeklySlots)
			.where(eq(weeklySlots.activityId, id))
			.get();
		const instanceRefs = db
			.select({ cnt: count() })
			.from(taskInstances)
			.where(eq(taskInstances.resolvedActivityId, id))
			.get();

		if ((slotRefs?.cnt ?? 0) > 0 || (instanceRefs?.cnt ?? 0) > 0) {
			return fail(400, {
				message: 'Cannot delete: activity is referenced by planner slots or task history'
			});
		}

		db.delete(activities).where(eq(activities.id, id)).run();

		return { success: true };
	}
};
