import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { taskInstances, weeklySlots, activities, categories } from '$lib/server/db/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	toLocalISOString,
	getMonday,
	addDays,
	getISOWeekNumber,
	getISOWeekYear
} from '$lib/server/week-generator';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseWeekParam(param: string | null): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(param + 'T00:00:00');
		if (!isNaN(parsed.getTime())) {
			return getMonday(parsed);
		}
	}
	const lastMonday = addDays(getMonday(new Date()), -7);
	return lastMonday;
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ url }) => {
	const weekParam = url.searchParams.get('week');
	const monday = parseWeekParam(weekParam);
	const sunday = addDays(monday, 6);
	const nextMonday = addDays(monday, 7);

	const weekNumber = getISOWeekNumber(monday);
	const weekYear = getISOWeekYear(monday);

	const weekMeta = {
		monday: formatDate(monday),
		sunday: formatDate(sunday),
		weekNumber,
		weekYear,
		prevWeek: formatDate(addDays(monday, -7)),
		nextWeek: formatDate(nextMonday)
	};

	const mondayStr = toLocalISOString(monday);
	const nextMondayStr = toLocalISOString(nextMonday);

	const slotActivities = alias(activities, 'slot_activities');
	const activityCategories = alias(categories, 'activity_categories');

	const instances = db
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
			categoryId: sql<number>`coalesce(${weeklySlots.categoryId}, ${slotActivities.categoryId})`.as(
				'effective_category_id'
			),
			categoryName: sql<string>`coalesce(${categories.name}, ${activityCategories.name})`.as(
				'effective_category_name'
			),
			activityId: taskInstances.resolvedActivityId,
			activityName: activities.name
		})
		.from(taskInstances)
		.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(activityCategories, eq(slotActivities.categoryId, activityCategories.id))
		.leftJoin(activities, eq(taskInstances.resolvedActivityId, activities.id))
		.where(
			and(gte(taskInstances.scheduledAt, mondayStr), lt(taskInstances.scheduledAt, nextMondayStr))
		)
		.orderBy(taskInstances.scheduledAt)
		.all();

	const instancesByDay: Record<number, typeof instances> = {};
	for (const inst of instances) {
		const d = new Date(inst.scheduledAt);
		const dayOfWeek = d.getDay();
		const weekdayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		if (!instancesByDay[weekdayIdx]) instancesByDay[weekdayIdx] = [];
		instancesByDay[weekdayIdx].push(inst);
	}

	const summary = {
		total: instances.length,
		completed: instances.filter((i) => i.status === 'completed').length,
		delayed: instances.filter((i) => i.status === 'delayed').length,
		early: instances.filter((i) => i.status === 'early').length,
		skipped: instances.filter((i) => i.status === 'skipped').length,
		pending: instances.filter((i) => i.status === 'pending').length
	};

	return { instancesByDay, weekMeta, weekdays: WEEKDAYS, summary };
};
