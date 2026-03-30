import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { weeklySlots, activities, categories, taskInstances } from '$lib/server/db/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
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
	return getMonday(new Date());
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ url }) => {
	const weekParam = url.searchParams.get('week');
	const monday = parseWeekParam(weekParam);
	const sunday = addDays(monday, 6);
	const nextMonday = addDays(monday, 7);
	const currentMonday = getMonday(new Date());

	const weekNumber = getISOWeekNumber(monday);
	const weekYear = getISOWeekYear(monday);
	const isCurrent = formatDate(monday) === formatDate(currentMonday);
	const isPast = monday < currentMonday && !isCurrent;

	const weekMeta = {
		monday: formatDate(monday),
		sunday: formatDate(sunday),
		weekNumber,
		weekYear,
		isPast,
		isCurrent,
		prevWeek: formatDate(addDays(monday, -7)),
		nextWeek: formatDate(nextMonday)
	};

	const allCategories = db.select().from(categories).all();
	const allActivities = db
		.select()
		.from(activities)
		.where(eq(activities.active, true))
		.orderBy(activities.name)
		.all();

	if (isPast) {
		const mondayStr = toLocalISOString(monday);
		const nextMondayStr = toLocalISOString(nextMonday);

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
				categoryId: weeklySlots.categoryId,
				categoryName: categories.name,
				activityId: taskInstances.resolvedActivityId,
				activityName: activities.name
			})
			.from(taskInstances)
			.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
			.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
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

		return {
			mode: 'history' as const,
			instancesByDay,
			weekMeta,
			categories: allCategories,
			activities: allActivities,
			weekdays: WEEKDAYS,
			slots: []
		};
	}

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

	return {
		mode: 'template' as const,
		slots,
		weekMeta,
		categories: allCategories,
		activities: allActivities,
		weekdays: WEEKDAYS,
		instancesByDay: {}
	};
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
