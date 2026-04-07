import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { taskInstances, weeklySlots, activities, categories } from '$lib/server/db/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
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

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	generateCurrentWeek(userId);

	const { start, end } = todayRange();

	const slotActivities = alias(activities, 'slot_activities');
	const activityCategories = alias(categories, 'activity_categories');

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
			durationOverride: taskInstances.durationOverride,
			categoryId: sql<number>`coalesce(${weeklySlots.categoryId}, ${slotActivities.categoryId})`.as(
				'effective_category_id'
			),
			categoryName: sql<string>`coalesce(${categories.name}, ${activityCategories.name})`.as(
				'effective_category_name'
			),
			activityId: taskInstances.resolvedActivityId,
			activityName: activities.name,
			activityColor: activities.color
		})
		.from(taskInstances)
		.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(activityCategories, eq(slotActivities.categoryId, activityCategories.id))
		.leftJoin(activities, eq(taskInstances.resolvedActivityId, activities.id))
		.where(
			and(
				eq(taskInstances.userId, userId),
				gte(taskInstances.scheduledAt, start),
				lt(taskInstances.scheduledAt, end)
			)
		)
		.orderBy(taskInstances.scheduledAt)
		.all();

	const allActivities = db
		.select({
			id: activities.id,
			name: activities.name,
			categoryId: activities.categoryId
		})
		.from(activities)
		.where(and(eq(activities.active, true), eq(activities.userId, userId)))
		.orderBy(activities.name)
		.all();

	return { tasks, activities: allActivities, now: toLocalISOString(new Date()) };
};

export const actions: Actions = {
	updateStatus: async ({ request, locals }) => {
		const userId = locals.user!.id;
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

		const updateData: Record<string, unknown> = {
			status: status as (typeof validStatuses)[number],
			completedAt
		};

		// Clear resolved activity when resetting or skipping a category-mode task
		if (status === 'pending' || status === 'skipped') {
			const task = db
				.select({ slotMode: weeklySlots.mode })
				.from(taskInstances)
				.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
				.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
				.get();

			if (task?.slotMode === 'category') {
				updateData.resolvedActivityId = null;
			}
		}

		db.update(taskInstances)
			.set(updateData)
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.run();

		return { success: true };
	},

	resolveActivity: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;

		if (!id) return fail(400, { message: 'Missing task id' });

		db.update(taskInstances)
			.set({ resolvedActivityId: activityId })
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.run();

		return { success: true };
	},

	updateScheduledAt: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const time = formData.get('time')?.toString()?.trim();

		if (!id) return fail(400, { message: 'Missing task id' });
		if (!time || !/^\d{2}:\d{2}$/.test(time)) return fail(400, { message: 'Invalid time format' });

		const task = db
			.select()
			.from(taskInstances)
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.get();
		if (!task) return fail(404, { message: 'Task not found' });

		const datePart = task.scheduledAt.slice(0, 10);
		const newScheduledAt = `${datePart}T${time}:00`;

		db.update(taskInstances)
			.set({ scheduledAt: newScheduledAt })
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.run();

		return { success: true };
	},

	updateDuration: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const minutes = formData.get('minutes')?.toString()?.trim();

		if (!id) return fail(400, { message: 'Missing task id' });
		if (!minutes || isNaN(Number(minutes)) || Number(minutes) < 0) {
			return fail(400, { message: 'Invalid duration' });
		}

		const value = Number(minutes) === 0 ? null : Number(minutes);
		db.update(taskInstances)
			.set({ durationOverride: value })
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.run();

		return { success: true };
	},

	deleteTask: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing task id' });

		db.delete(taskInstances)
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
			.run();

		return { success: true };
	}
};
