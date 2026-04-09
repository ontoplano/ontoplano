import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { weeklySlots, activities, categories, taskInstances } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
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

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const userId = event.locals.user!.id;
	const weekParam = url.searchParams.get('week');
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

	const now = new Date();
	const todayDow = now.getDay();
	const todayDayIndex = todayDow === 0 ? 6 : todayDow - 1;
	const today = formatDate(now);
	const isPastWeek = formatDate(monday) < formatDate(currentMonday);

	const allCategories = db.select().from(categories).where(eq(categories.userId, userId)).all();
	const allActivities = db
		.select()
		.from(activities)
		.where(and(eq(activities.active, true), eq(activities.userId, userId)))
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
		.where(eq(weeklySlots.userId, userId))
		.orderBy(weeklySlots.weekday, weeklySlots.startTime)
		.all();

	return {
		slots,
		weekMeta,
		categories: allCategories,
		activities: allActivities,
		weekdays: WEEKDAYS,
		today,
		todayDayIndex,
		isPastWeek
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
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
			.values({
				userId,
				weekday,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label
			})
			.run();

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
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
		const existing = db
			.select({ id: weeklySlots.id })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Slot not found' });

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
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
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
			.select({ id: weeklySlots.id })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Slot not found' });

		db.update(weeklySlots)
			.set({ active: !active, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.run();

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const existing = db
			.select({ id: weeklySlots.id })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Slot not found' });

		db.delete(taskInstances)
			.where(and(eq(taskInstances.slotId, id), eq(taskInstances.userId, userId)))
			.run();
		db.delete(weeklySlots)
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.run();

		return { success: true };
	},

	bulkDelete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const idsStr = formData.get('ids')?.toString() ?? '';
		const ids = idsStr
			.split(',')
			.map(Number)
			.filter((n) => n > 0);

		if (ids.length === 0) return fail(400, { message: 'No slots selected' });
		const userSlots = db
			.select({ id: weeklySlots.id })
			.from(weeklySlots)
			.where(and(inArray(weeklySlots.id, ids), eq(weeklySlots.userId, userId)))
			.all();
		const userSlotIds = userSlots.map((slot) => slot.id);
		if (userSlotIds.length === 0) return fail(404, { message: 'Slots not found' });

		db.delete(taskInstances)
			.where(and(inArray(taskInstances.slotId, userSlotIds), eq(taskInstances.userId, userId)))
			.run();
		db.delete(weeklySlots)
			.where(and(inArray(weeklySlots.id, userSlotIds), eq(weeklySlots.userId, userId)))
			.run();

		return { success: true };
	},

	copyToWeekdays: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const idsStr = formData.get('ids')?.toString() ?? '';
		const targetDaysStr = formData.get('targetDays')?.toString() ?? '';
		const ids = idsStr
			.split(',')
			.map(Number)
			.filter((n) => n > 0);
		const targetDays = targetDaysStr
			.split(',')
			.map(Number)
			.filter((n) => n >= 0 && n <= 6);

		if (ids.length === 0) return fail(400, { message: 'No slots selected' });
		if (targetDays.length === 0) return fail(400, { message: 'No target days selected' });

		const sourceSlots = db
			.select()
			.from(weeklySlots)
			.where(and(inArray(weeklySlots.id, ids), eq(weeklySlots.userId, userId)))
			.all();
		if (sourceSlots.length === 0) return fail(404, { message: 'Slots not found' });

		for (const slot of sourceSlots) {
			for (const day of targetDays) {
				if (day === slot.weekday) continue;
				db.insert(weeklySlots)
					.values({
						userId,
						weekday: day,
						startTime: slot.startTime,
						durationMinutes: slot.durationMinutes,
						mode: slot.mode,
						categoryId: slot.categoryId,
						activityId: slot.activityId,
						label: slot.label,
						active: slot.active
					})
					.run();
			}
		}

		return { success: true };
	}
};
