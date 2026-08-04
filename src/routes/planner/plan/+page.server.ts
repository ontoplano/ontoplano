import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	weeklySlots,
	activities,
	categories,
	taskInstances,
	suppressedSlots,
	exceptionalSlots,
	planningSchemes,
	schemeSlots
} from '$lib/server/db/schema';
import { eq, and, inArray, gte, lt } from 'drizzle-orm';
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

function clearWeeklyPlan(userId: string) {
	db.transaction((tx) => {
		const userSlots = tx
			.select({ id: weeklySlots.id })
			.from(weeklySlots)
			.where(eq(weeklySlots.userId, userId))
			.all();
		const slotIds = userSlots.map((slot) => slot.id);

		if (slotIds.length > 0) {
			tx.delete(taskInstances)
				.where(and(inArray(taskInstances.slotId, slotIds), eq(taskInstances.userId, userId)))
				.run();
			tx.delete(suppressedSlots)
				.where(and(inArray(suppressedSlots.slotId, slotIds), eq(suppressedSlots.userId, userId)))
				.run();
		}

		tx.delete(weeklySlots).where(eq(weeklySlots.userId, userId)).run();
	});
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

	const schemes = db
		.select({ id: planningSchemes.id, name: planningSchemes.name })
		.from(planningSchemes)
		.where(eq(planningSchemes.userId, userId))
		.orderBy(planningSchemes.name)
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

	const weekSuppressions = db
		.select()
		.from(suppressedSlots)
		.where(
			and(
				eq(suppressedSlots.userId, userId),
				gte(suppressedSlots.date, formatDate(monday)),
				lt(suppressedSlots.date, formatDate(nextMonday))
			)
		)
		.all();

	const weekExceptionals = db
		.select({
			id: exceptionalSlots.id,
			date: exceptionalSlots.date,
			startTime: exceptionalSlots.startTime,
			durationMinutes: exceptionalSlots.durationMinutes,
			mode: exceptionalSlots.mode,
			categoryId: exceptionalSlots.categoryId,
			categoryName: categories.name,
			activityId: exceptionalSlots.activityId,
			activityName: activities.name,
			label: exceptionalSlots.label,
			active: exceptionalSlots.active,
			status: exceptionalSlots.status
		})
		.from(exceptionalSlots)
		.leftJoin(categories, eq(exceptionalSlots.categoryId, categories.id))
		.leftJoin(activities, eq(exceptionalSlots.activityId, activities.id))
		.where(
			and(
				eq(exceptionalSlots.userId, userId),
				gte(exceptionalSlots.date, formatDate(monday)),
				lt(exceptionalSlots.date, formatDate(nextMonday))
			)
		)
		.orderBy(exceptionalSlots.date, exceptionalSlots.startTime)
		.all();

	return {
		slots,
		weekMeta,
		categories: allCategories,
		activities: allActivities,
		schemes,
		weekdays: WEEKDAYS,
		today,
		todayDayIndex,
		isPastWeek,
		suppressions: weekSuppressions,
		exceptionals: weekExceptionals
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
	},

	clearAll: async ({ locals }) => {
		const userId = locals.user!.id;
		clearWeeklyPlan(userId);

		return { success: true };
	},

	saveScheme: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';

		if (!name) return fail(400, { message: 'Scheme name is required' });

		const existingScheme = db
			.select({ id: planningSchemes.id })
			.from(planningSchemes)
			.where(and(eq(planningSchemes.userId, userId), eq(planningSchemes.name, name)))
			.get();
		if (existingScheme) return fail(400, { message: 'A scheme with this name already exists' });

		db.transaction((tx) => {
			const schemeInsert = tx.insert(planningSchemes).values({ userId, name }).run();
			const schemeId = Number(schemeInsert.lastInsertRowid);
			const slots = tx.select().from(weeklySlots).where(eq(weeklySlots.userId, userId)).all();

			if (slots.length > 0) {
				tx.insert(schemeSlots)
					.values(
						slots.map((slot) => ({
							schemeId,
							weekday: slot.weekday,
							startTime: slot.startTime,
							durationMinutes: slot.durationMinutes,
							mode: slot.mode,
							categoryId: slot.categoryId,
							activityId: slot.activityId,
							label: slot.label,
							active: slot.active
						}))
					)
					.run();
			}
		});

		return { success: true };
	},

	loadScheme: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const schemeId = Number(formData.get('schemeId'));

		if (!schemeId) return fail(400, { message: 'Missing scheme id' });

		const scheme = db
			.select({ id: planningSchemes.id })
			.from(planningSchemes)
			.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, userId)))
			.get();
		if (!scheme) return fail(404, { message: 'Scheme not found' });

		db.transaction((tx) => {
			const userSlots = tx
				.select({ id: weeklySlots.id })
				.from(weeklySlots)
				.where(eq(weeklySlots.userId, userId))
				.all();
			const slotIds = userSlots.map((slot) => slot.id);

			if (slotIds.length > 0) {
				tx.delete(taskInstances)
					.where(and(inArray(taskInstances.slotId, slotIds), eq(taskInstances.userId, userId)))
					.run();
				tx.delete(suppressedSlots)
					.where(and(inArray(suppressedSlots.slotId, slotIds), eq(suppressedSlots.userId, userId)))
					.run();
			}

			tx.delete(weeklySlots).where(eq(weeklySlots.userId, userId)).run();

			const slots = tx
				.select()
				.from(schemeSlots)
				.where(eq(schemeSlots.schemeId, schemeId))
				.orderBy(schemeSlots.weekday, schemeSlots.startTime)
				.all();

			if (slots.length > 0) {
				tx.insert(weeklySlots)
					.values(
						slots.map((slot) => ({
							userId,
							weekday: slot.weekday,
							startTime: slot.startTime,
							durationMinutes: slot.durationMinutes,
							mode: slot.mode,
							categoryId: slot.categoryId,
							activityId: slot.activityId,
							label: slot.label,
							active: slot.active
						}))
					)
					.run();
			}
		});

		return { success: true };
	},

	deleteScheme: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const schemeId = Number(formData.get('schemeId'));

		if (!schemeId) return fail(400, { message: 'Missing scheme id' });

		const scheme = db
			.select({ id: planningSchemes.id })
			.from(planningSchemes)
			.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, userId)))
			.get();
		if (!scheme) return fail(404, { message: 'Scheme not found' });

		db.delete(planningSchemes)
			.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, userId)))
			.run();

		return { success: true };
	},

	renameScheme: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const schemeId = Number(formData.get('schemeId'));
		const name = formData.get('name')?.toString().trim() ?? '';

		if (!schemeId) return fail(400, { message: 'Missing scheme id' });
		if (!name) return fail(400, { message: 'Scheme name is required' });

		const scheme = db
			.select({ id: planningSchemes.id })
			.from(planningSchemes)
			.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, userId)))
			.get();
		if (!scheme) return fail(404, { message: 'Scheme not found' });

		const duplicate = db
			.select({ id: planningSchemes.id })
			.from(planningSchemes)
			.where(and(eq(planningSchemes.userId, userId), eq(planningSchemes.name, name)))
			.get();
		if (duplicate && duplicate.id !== schemeId) {
			return fail(400, { message: 'A scheme with this name already exists' });
		}

		db.update(planningSchemes)
			.set({ name, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, userId)))
			.run();

		return { success: true };
	},

	suppress: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const slotId = Number(formData.get('slotId'));
		const date = formData.get('date')?.toString()?.trim() ?? '';

		if (!slotId) return fail(400, { message: 'Missing slot id' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });

		const existing = db
			.select({ id: suppressedSlots.id })
			.from(suppressedSlots)
			.where(
				and(
					eq(suppressedSlots.userId, userId),
					eq(suppressedSlots.slotId, slotId),
					eq(suppressedSlots.date, date)
				)
			)
			.get();
		if (existing) return { success: true };

		db.insert(suppressedSlots)
			.values({ userId, date, slotId })
			.run();

		return { success: true };
	},

	unsuppress: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const slotId = Number(formData.get('slotId'));
		const date = formData.get('date')?.toString()?.trim() ?? '';

		if (!slotId) return fail(400, { message: 'Missing slot id' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });

		db.delete(suppressedSlots)
			.where(
				and(
					eq(suppressedSlots.userId, userId),
					eq(suppressedSlots.slotId, slotId),
					eq(suppressedSlots.date, date)
				)
			)
			.run();

		return { success: true };
	},

	createExceptional: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);
		const mode = formData.get('mode')?.toString() as 'category' | 'activity';
		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });
		if (!mode) return fail(400, { message: 'Mode is required' });
		if (mode === 'category' && !categoryId) return fail(400, { message: 'Category required' });
		if (mode === 'activity' && !activityId) return fail(400, { message: 'Activity required' });

		db.insert(exceptionalSlots)
			.values({
				userId,
				date,
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

	deleteExceptional: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(exceptionalSlots)
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	importCsv: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const csv = formData.get('csv')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);
		const clearExisting = formData.get('clearExisting') === 'on';

		if (!csv) return fail(400, { message: 'CSV content is required' });

		const lines = csv.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
		if (lines.length < 2) return fail(400, { message: 'CSV must have a header and at least one row' });

		const dataLines = lines.slice(1);

		const userActivities = db
			.select({ id: activities.id, name: activities.name })
			.from(activities)
			.where(eq(activities.userId, userId))
			.all();
		const activityMap = new Map(userActivities.map((a) => [a.name.toLowerCase(), a.id]));

		const slotsToInsert: {
			userId: string;
			weekday: number;
			startTime: string;
			durationMinutes: number;
			mode: 'activity' | 'category';
			activityId: number | null;
			categoryId: number | null;
			label: string;
		}[] = [];

		const notFound: string[] = [];

		for (const line of dataLines) {
			const cells = line.split(',').map((c) => c.trim());
			if (cells.length < 2) continue;

			const timeCode = cells[0];
			// Parse time: 610 -> 06:10, 1810 -> 18:10
			const padded = timeCode.padStart(4, '0');
			const hours = padded.slice(0, -2);
			const minutes = padded.slice(-2);
			const startTime = `${hours.padStart(2, '0')}:${minutes}`;

			if (!/^\d{2}:\d{2}$/.test(startTime)) continue;

			for (let day = 0; day < 7 && day + 1 < cells.length; day++) {
				const cellValue = cells[day + 1].trim();
				if (!cellValue) continue;

				const activityId = activityMap.get(cellValue.toLowerCase());
				if (activityId) {
					slotsToInsert.push({
						userId,
						weekday: day,
						startTime,
						durationMinutes,
						mode: 'activity',
						activityId,
						categoryId: null,
						label: ''
					});
				} else {
					slotsToInsert.push({
						userId,
						weekday: day,
						startTime,
						durationMinutes,
						mode: 'category',
						activityId: null,
						categoryId: null,
						label: cellValue
					});
					if (!notFound.includes(cellValue)) notFound.push(cellValue);
				}
			}
		}

		if (slotsToInsert.length === 0) return fail(400, { message: 'No valid slots found in CSV' });

		db.transaction((tx) => {
			if (clearExisting) {
				const userSlots = tx
					.select({ id: weeklySlots.id })
					.from(weeklySlots)
					.where(eq(weeklySlots.userId, userId))
					.all();
				const slotIds = userSlots.map((s) => s.id);
				if (slotIds.length > 0) {
					tx.delete(taskInstances)
						.where(and(inArray(taskInstances.slotId, slotIds), eq(taskInstances.userId, userId)))
						.run();
					tx.delete(suppressedSlots)
						.where(and(inArray(suppressedSlots.slotId, slotIds), eq(suppressedSlots.userId, userId)))
						.run();
				}
				tx.delete(weeklySlots).where(eq(weeklySlots.userId, userId)).run();
			}

			for (const slot of slotsToInsert) {
				tx.insert(weeklySlots).values(slot).run();
			}
		});

		if (notFound.length > 0) {
			return { success: true, message: `Imported ${slotsToInsert.length} slots. Activities not found (used as labels): ${notFound.join(', ')}` };
		}

		return { success: true, message: `Imported ${slotsToInsert.length} slots.` };
	}
};
