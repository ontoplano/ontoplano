import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { taskInstances, weeklySlots, activities, categories } from '$lib/server/db/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { generateCurrentWeek, toLocalISOString } from '$lib/server/week-generator';

function todayRange(): { start: string; end: string } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return {
		start: toLocalISOString(start),
		end: toLocalISOString(end)
	};
}

export const load: PageServerLoad = async () => {
	generateCurrentWeek();

	const { start, end } = todayRange();

	const tasks = db
		.select({
			id: taskInstances.id,
			scheduledAt: taskInstances.scheduledAt,
			status: taskInstances.status,
			completedAt: taskInstances.completedAt,
			notes: taskInstances.notes,
			slotId: taskInstances.slotId,
			slotMode: weeklySlots.mode,
			slotLabel: weeklySlots.label,
			slotStartTime: weeklySlots.startTime,
			slotDuration: weeklySlots.durationMinutes,
			categoryId: weeklySlots.categoryId,
			categoryName: categories.name,
			activityId: taskInstances.resolvedActivityId,
			activityName: activities.name,
			activityColor: activities.color
		})
		.from(taskInstances)
		.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(activities, eq(taskInstances.resolvedActivityId, activities.id))
		.where(and(gte(taskInstances.scheduledAt, start), lt(taskInstances.scheduledAt, end)))
		.orderBy(taskInstances.scheduledAt)
		.all();

	const allActivities = db
		.select({
			id: activities.id,
			name: activities.name,
			categoryId: activities.categoryId
		})
		.from(activities)
		.where(eq(activities.active, true))
		.orderBy(activities.name)
		.all();

	return { tasks, activities: allActivities, now: toLocalISOString(new Date()) };
};

export const actions: Actions = {
	updateStatus: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const status = formData.get('status')?.toString();

		if (!id || !status) return fail(400, { message: 'Missing id or status' });

		const validStatuses = ['pending', 'completed', 'delayed', 'early', 'skipped'] as const;
		if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
			return fail(400, { message: 'Invalid status' });
		}

		const completedAt = ['completed', 'delayed', 'early'].includes(status)
			? toLocalISOString(new Date())
			: null;

		db.update(taskInstances)
			.set({ status: status as (typeof validStatuses)[number], completedAt })
			.where(eq(taskInstances.id, id))
			.run();

		return { success: true };
	},

	resolveActivity: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;

		if (!id) return fail(400, { message: 'Missing task id' });

		db.update(taskInstances)
			.set({ resolvedActivityId: activityId })
			.where(eq(taskInstances.id, id))
			.run();

		return { success: true };
	}
};
