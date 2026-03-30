import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { weeklySlots, activities, categories, taskInstances } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const load: PageServerLoad = async () => {
	const allCategories = db.select().from(categories).all();
	const allActivities = db
		.select()
		.from(activities)
		.where(eq(activities.active, true))
		.orderBy(activities.name)
		.all();

	const slots = db
		.select({
			id: weeklySlots.id,
			weekday: weeklySlots.weekday,
			startTime: weeklySlots.startTime,
			durationMinutes: weeklySlots.durationMinutes,
			mode: weeklySlots.mode,
			categoryId: weeklySlots.categoryId,
			categoryName: categories.name,
			activityId: weeklySlots.activityId,
			activityName: activities.name,
			label: weeklySlots.label,
			active: weeklySlots.active
		})
		.from(weeklySlots)
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(activities, eq(weeklySlots.activityId, activities.id))
		.orderBy(weeklySlots.weekday, weeklySlots.startTime)
		.all();

	return { slots, categories: allCategories, activities: allActivities, weekdays: WEEKDAYS };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const weekday = Number(formData.get('weekday'));
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);
		const mode = formData.get('mode')?.toString() as 'category' | 'activity';
		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (weekday < 0 || weekday > 6) return fail(400, { message: 'Invalid weekday' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time format' });
		if (!mode) return fail(400, { message: 'Mode is required' });
		if (mode === 'category' && !categoryId) return fail(400, { message: 'Category required' });
		if (mode === 'activity' && !activityId) return fail(400, { message: 'Activity required' });

		db.insert(weeklySlots)
			.values({ weekday, startTime, durationMinutes, mode, categoryId, activityId, label })
			.run();

		return { success: true };
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const weekday = Number(formData.get('weekday'));
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);
		const mode = formData.get('mode')?.toString() as 'category' | 'activity';
		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });

		db.update(weeklySlots)
			.set({
				weekday,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label,
				updatedAt: toLocalISOString(new Date())
			})
			.where(eq(weeklySlots.id, id))
			.run();

		return { success: true };
	},

	toggleActive: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const active = formData.get('active') === 'true';

		if (!id) return fail(400, { message: 'Missing id' });

		db.update(weeklySlots)
			.set({ active: !active, updatedAt: toLocalISOString(new Date()) })
			.where(eq(weeklySlots.id, id))
			.run();

		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(taskInstances).where(eq(taskInstances.slotId, id)).run();
		db.delete(weeklySlots).where(eq(weeklySlots.id, id)).run();

		return { success: true };
	}
};
