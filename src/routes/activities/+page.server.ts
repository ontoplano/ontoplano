import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activities, categories, weeklySlots, taskInstances } from '$lib/server/db/schema';
import { eq, count, and } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
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
		.where(eq(activities.userId, userId))
		.orderBy(activities.name)
		.all();

	const activitiesWithRefs = allActivities.map((a) => {
		const slotRefs = db
			.select({ cnt: count() })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.activityId, a.id), eq(weeklySlots.userId, userId)))
			.get();
		const instanceRefs = db
			.select({ cnt: count() })
			.from(taskInstances)
			.where(and(eq(taskInstances.resolvedActivityId, a.id), eq(taskInstances.userId, userId)))
			.get();
		return {
			...a,
			hasReferences: (slotRefs?.cnt ?? 0) > 0 || (instanceRefs?.cnt ?? 0) > 0
		};
	});

	return { activities: activitiesWithRefs, categories: allCategories };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const categoryId = Number(formData.get('categoryId'));
		const description = formData.get('description')?.toString()?.trim() ?? '';

		if (!name) return fail(400, { message: 'Name is required' });
		if (!categoryId) return fail(400, { message: 'Category is required' });

		db.insert(activities).values({ userId, name, categoryId, description }).run();

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const name = formData.get('name')?.toString()?.trim();
		const categoryId = Number(formData.get('categoryId'));
		const description = formData.get('description')?.toString()?.trim() ?? '';

		if (!id || !name) return fail(400, { message: 'Missing fields' });
		const existing = db
			.select({ id: activities.id })
			.from(activities)
			.where(and(eq(activities.id, id), eq(activities.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Activity not found' });

		db.update(activities)
			.set({
				name,
				categoryId,
				description,
				updatedAt: toLocalISOString(new Date())
			})
			.where(and(eq(activities.id, id), eq(activities.userId, userId)))
			.run();

		return { success: true };
	},

	toggleActive: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const active = formData.get('active') === 'true';

		if (!id) return fail(400, { message: 'Missing id' });
		const existing = db
			.select({ id: activities.id })
			.from(activities)
			.where(and(eq(activities.id, id), eq(activities.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Activity not found' });

		db.update(activities)
			.set({ active: !active, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(activities.id, id), eq(activities.userId, userId)))
			.run();

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const existing = db
			.select({ id: activities.id })
			.from(activities)
			.where(and(eq(activities.id, id), eq(activities.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Activity not found' });

		const slotRefs = db
			.select({ cnt: count() })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.activityId, id), eq(weeklySlots.userId, userId)))
			.get();
		const instanceRefs = db
			.select({ cnt: count() })
			.from(taskInstances)
			.where(and(eq(taskInstances.resolvedActivityId, id), eq(taskInstances.userId, userId)))
			.get();

		if ((slotRefs?.cnt ?? 0) > 0 || (instanceRefs?.cnt ?? 0) > 0) {
			return fail(400, {
				message: 'Cannot delete: activity is referenced by planner slots or task history'
			});
		}

		db.delete(activities)
			.where(and(eq(activities.id, id), eq(activities.userId, userId)))
			.run();

		return { success: true };
	}
};
