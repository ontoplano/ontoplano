import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	taskInstances,
	weeklySlots,
	activities,
	categories,
	exceptionalSlots
} from '$lib/server/db/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	generateCurrentWeek,
	toLocalISOString,
	getMonday,
	addDays,
	getISOWeekNumber,
	getISOWeekYear
} from '$lib/server/week-generator';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseWeekParam(param: string | null): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(param + 'T00:00:00');
		if (!isNaN(parsed.getTime())) {
			return getMonday(parsed);
		}
	}
	return getMonday(new Date());
}

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const userId = event.locals.user!.id;
	generateCurrentWeek(userId);

	const weekParam = url.searchParams.get('week');
	const dayParam = url.searchParams.get('day');

	const monday = parseWeekParam(weekParam);
	const sunday = addDays(monday, 6);
	const nextMonday = addDays(monday, 7);
	const currentMonday = getMonday(new Date());

	const weekNumber = getISOWeekNumber(monday);
	const weekYear = getISOWeekYear(monday);
	const isCurrent = formatDate(monday) === formatDate(currentMonday);

	const weekMeta = {
		monday: formatDate(monday),
		sunday: formatDate(sunday),
		weekNumber,
		weekYear,
		isCurrent,
		prevWeek: formatDate(addDays(monday, -7)),
		nextWeek: formatDate(nextMonday)
	};

	let selectedDayIndex: number;
	if (dayParam !== null && /^\d$/.test(dayParam)) {
		selectedDayIndex = Math.min(Math.max(Number(dayParam), 0), 6);
	} else {
		const now = new Date();
		const dow = now.getDay();
		selectedDayIndex = dow === 0 ? 6 : dow - 1;
	}

	const selectedDate = addDays(monday, selectedDayIndex);
	const nextDate = addDays(selectedDate, 1);
	const start = toLocalISOString(selectedDate);
	const end = toLocalISOString(nextDate);

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
			slotActivityId: weeklySlots.activityId,
			slotActivityName: slotActivities.name,
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
			categoryId: activities.categoryId,
			categoryName: categories.name
		})
		.from(activities)
		.innerJoin(categories, eq(activities.categoryId, categories.id))
		.where(and(eq(activities.active, true), eq(activities.userId, userId)))
		.orderBy(categories.name, activities.name)
		.all();

	const selectedDateStr = formatDate(selectedDate);
	const exceptionalActivities = alias(activities, 'exceptional_activities');
	const exceptionalCategories = alias(categories, 'exceptional_categories');
	const resolvedExcActivities = alias(activities, 'resolved_exc_activities');

	const exceptionalTasks = db
		.select({
			id: exceptionalSlots.id,
			date: exceptionalSlots.date,
			startTime: exceptionalSlots.startTime,
			durationMinutes: exceptionalSlots.durationMinutes,
			durationOverride: exceptionalSlots.durationOverride,
			mode: exceptionalSlots.mode,
			categoryId: sql<number>`coalesce(${exceptionalSlots.categoryId}, ${exceptionalActivities.categoryId})`.as(
				'exc_category_id'
			),
			categoryName: sql<string>`coalesce(${exceptionalCategories.name}, (SELECT name FROM categories WHERE id = ${exceptionalActivities.categoryId}))`.as(
				'exc_category_name'
			),
			slotActivityId: exceptionalSlots.activityId,
			slotActivityName: exceptionalActivities.name,
			activityId: exceptionalSlots.resolvedActivityId,
			activityName: resolvedExcActivities.name,
			activityColor: resolvedExcActivities.color,
			label: exceptionalSlots.label,
			active: exceptionalSlots.active,
			status: exceptionalSlots.status,
			completedAt: exceptionalSlots.completedAt,
			notes: exceptionalSlots.notes
		})
		.from(exceptionalSlots)
		.leftJoin(exceptionalCategories, eq(exceptionalSlots.categoryId, exceptionalCategories.id))
		.leftJoin(exceptionalActivities, eq(exceptionalSlots.activityId, exceptionalActivities.id))
		.leftJoin(resolvedExcActivities, eq(exceptionalSlots.resolvedActivityId, resolvedExcActivities.id))
		.where(
			and(
				eq(exceptionalSlots.userId, userId),
				eq(exceptionalSlots.date, selectedDateStr)
			)
		)
		.orderBy(exceptionalSlots.startTime)
		.all();

	const mondayStr = toLocalISOString(monday);
	const nextMondayStr = toLocalISOString(nextMonday);
	const allWeekTasks = db
		.select({
			scheduledAt: taskInstances.scheduledAt
		})
		.from(taskInstances)
		.where(
			and(
				eq(taskInstances.userId, userId),
				gte(taskInstances.scheduledAt, mondayStr),
				lt(taskInstances.scheduledAt, nextMondayStr)
			)
		)
		.all();

	const taskCountByDay: Record<number, number> = {};
	for (const t of allWeekTasks) {
		const d = new Date(t.scheduledAt);
		const dow = d.getDay();
		const idx = dow === 0 ? 6 : dow - 1;
		taskCountByDay[idx] = (taskCountByDay[idx] || 0) + 1;
	}

	const now = new Date();
	const todayDow = now.getDay();
	const todayDayIndex = todayDow === 0 ? 6 : todayDow - 1;

	const allCategories = db.select().from(categories).where(eq(categories.userId, userId)).all();

	return {
		tasks,
		exceptionalTasks,
		activities: allActivities,
		categories: allCategories,
		now: toLocalISOString(now),
		weekMeta,
		weekdays: WEEKDAYS,
		selectedDayIndex,
		todayDayIndex,
		taskCountByDay,
		selectedDate: formatDate(selectedDate),
    validStatuses
	};
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
	},

	updateExceptionalStatus: async ({ request, locals }) => {
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

		if (status === 'pending' || status === 'skipped') {
			const exc = db
				.select({ mode: exceptionalSlots.mode })
				.from(exceptionalSlots)
				.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
				.get();

			if (exc?.mode === 'category') {
				updateData.resolvedActivityId = null;
			}
		}

		db.update(exceptionalSlots)
			.set(updateData)
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	resolveExceptionalActivity: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;

		if (!id) return fail(400, { message: 'Missing id' });

		db.update(exceptionalSlots)
			.set({ resolvedActivityId: activityId })
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	updateExceptionalTime: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const time = formData.get('time')?.toString()?.trim();

		if (!id) return fail(400, { message: 'Missing id' });
		if (!time || !/^\d{2}:\d{2}$/.test(time)) return fail(400, { message: 'Invalid time format' });

		db.update(exceptionalSlots)
			.set({ startTime: time })
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	updateExceptionalDuration: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const minutes = formData.get('minutes')?.toString()?.trim();

		if (!id) return fail(400, { message: 'Missing id' });
		if (!minutes || isNaN(Number(minutes)) || Number(minutes) < 0) {
			return fail(400, { message: 'Invalid duration' });
		}

		const value = Number(minutes) === 0 ? null : Number(minutes);
		db.update(exceptionalSlots)
			.set({ durationOverride: value })
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	deleteExceptional: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(exceptionalSlots)
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	}
};
