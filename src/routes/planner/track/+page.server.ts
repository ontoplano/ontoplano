import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	taskInstances,
	weeklySlots,
	exceptionalSlots,
	activities,
	categories
} from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import {
	toLocalISOString,
	getMonday,
	addDays,
	getISOWeekNumber,
	getISOWeekYear
} from '$lib/server/week-generator';
import { generateInstances, listForDate, listInstances } from '$lib/server/services/instances';

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

	// Generate for the week actually being viewed. The old code only ever
	// generated the current one, so paging forward showed an empty week.
	generateInstances(userId, monday, nextMonday);

	const tasks = listForDate(userId, selectedDate);

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

	// Counted from the same source the list is built from, so a day tab can no
	// longer disagree with the rows underneath it.
	const weekOccurrences = listInstances(userId, monday, nextMonday);
	const taskCountByDay: Record<number, number> = {};
	for (const o of weekOccurrences) {
		const d = new Date(o.scheduledAt);
		const dow = d.getDay();
		const idx = dow === 0 ? 6 : dow - 1;
		taskCountByDay[idx] = (taskCountByDay[idx] || 0) + 1;
	}

	const now = new Date();
	const todayDow = now.getDay();
	const todayDayIndex = todayDow === 0 ? 6 : todayDow - 1;

	const allCategories = db.select().from(categories).where(eq(categories.userId, userId)).all();
	const validStatuses = ['pending', 'completed', 'delayed', 'early', 'skipped'] as const;

	return {
		tasks,
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

		// Clear the resolved activity when resetting or skipping a category-mode
		// task, whichever kind of block it came from.
		if (status === 'pending' || status === 'skipped') {
			const owning = db
				.select({
					slotMode: weeklySlots.mode,
					oneOffMode: exceptionalSlots.mode
				})
				.from(taskInstances)
				.leftJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
				.leftJoin(exceptionalSlots, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
				.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, userId)))
				.get();

			if ((owning?.slotMode ?? owning?.oneOffMode) === 'category') {
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

		// A one-off block and its instance are one-to-one, and the plan grid draws
		// the block — leaving it behind would put the same task at two times.
		if (task.exceptionalSlotId !== null) {
			db.update(exceptionalSlots)
				.set({ startTime: time })
				.where(
					and(eq(exceptionalSlots.id, task.exceptionalSlotId), eq(exceptionalSlots.userId, userId))
				)
				.run();
		}

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
