import { fail } from '@sveltejs/kit';
import { metaFromFormData, metaPatchFromFormData } from '$lib/server/services/meta';
import { ratingsFromForm } from '$lib/ratings';
import { listManifests } from '$lib/server/services/plugins';
import { listUnscheduled, promoteTodo } from '$lib/server/services/todos';
import { parseRecurrence, serialiseRecurrence, formatDate as recFormatDate } from '$lib/recurrence';
import { ServiceError } from '$lib/server/services/errors';

/**
 * Parse slot metadata, turning a validation failure into a form error rather
 * than letting it escape the action and surface as a 500.
 */
/**
 * The recurrence rule from a block form.
 *
 * Every-N shapes need an anchor to count from; the form supplies the block's
 * own date when it has one, and today otherwise, so "every 2 weeks" starts
 * counting from the occurrence you were looking at.
 */
function readRecurrence(formData: FormData): string {
	const kind = formData.get('recurrenceKind')?.toString() ?? 'weekly';
	const interval = Number(formData.get('recurrenceInterval') || 1);
	const anchor = formData.get('recurrenceAnchor')?.toString()?.trim() || recFormatDate(new Date());
	const monthDay = Number(formData.get('recurrenceMonthDay') || 1);

	if (kind === 'weeks' || kind === 'days') {
		// Round-tripping through the parser is the validation: anything out of
		// range comes back as plain weekly rather than reaching the database.
		return serialiseRecurrence(parseRecurrence(`${kind}:${interval}:${anchor}`));
	}
	if (kind === 'monthly') return serialiseRecurrence(parseRecurrence(`monthly:${monthDay}`));
	return 'weekly';
}

function readMeta(formData: FormData): { meta: string } | { message: string } {
	try {
		return { meta: metaFromFormData(formData) };
	} catch (e) {
		return { message: e instanceof ServiceError ? e.message : 'Invalid options' };
	}
}

function readMetaPatch(formData: FormData): { meta: string | undefined } | { message: string } {
	try {
		return { meta: metaPatchFromFormData(formData) };
	} catch (e) {
		return { message: e instanceof ServiceError ? e.message : 'Invalid options' };
	}
}
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
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
import { eq, and, inArray, gte, lt, sql } from 'drizzle-orm';
import { toLocalISOString, addDays } from '$lib/server/week-generator';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Days visible at once. Seven keeps every weekday on screen exactly once. */
const PLAN_DAYS = 7;

// Sentinel submitted by the activity <select> when the user wants to create the
// activity inline instead of picking an existing one.
const NEW_ACTIVITY_VALUE = '__new__';

// Resolves the submitted activity to an id, creating the activity on the fly when
// the "+ New activity" option was picked. An activity that already exists under the
// same name is reused instead of duplicated.
function resolveActivityId(
	userId: string,
	formData: FormData
): { activityId: number | null } | { message: string } {
	const raw = formData.get('activityId')?.toString()?.trim() ?? '';
	if (raw !== NEW_ACTIVITY_VALUE) {
		return { activityId: raw ? Number(raw) : null };
	}

	const name = formData.get('newActivityName')?.toString()?.trim() ?? '';
	const categoryId = Number(formData.get('newActivityCategoryId'));
	if (!name) return { message: 'Activity name is required' };
	if (!categoryId) return { message: 'Category is required for the new activity' };

	const category = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
		.get();
	if (!category) return { message: 'Category not found' };

	const existing = db
		.select({ id: activities.id })
		.from(activities)
		.where(and(eq(activities.userId, userId), sql`lower(${activities.name}) = lower(${name})`))
		.get();
	if (existing) return { activityId: existing.id };

	const inserted = db
		.insert(activities)
		.values({ userId, name, categoryId })
		.returning({ id: activities.id })
		.get();

	return { activityId: inserted.id };
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Start of the visible window, clamped so it never begins before today.
 *
 * The plan is what you are going to do; a window anchored on Monday puts
 * Monday to Wednesday of a Thursday in the past, where planning is pointless.
 * Anchoring on today makes every visible column actionable, and the seven-day
 * span still shows each weekday once, so recurring slots all remain reachable.
 */
function parseFromParam(param: string | null, today: Date): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(`${param}T00:00:00`);
		if (!isNaN(parsed.getTime()) && parsed.getTime() > today.getTime()) return parsed;
	}
	return today;
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
	// Whether the URL named a view matters: without one the client may pick the
	// list on a narrow screen, but an explicit choice is always honoured.
	const requestedView = url.searchParams.get('view');
	const view = requestedView === 'list' ? 'list' : 'grid';
	const viewExplicit = requestedView === 'list' || requestedView === 'grid';

	const today = startOfDay(new Date());
	const from = parseFromParam(url.searchParams.get('from'), today);
	const to = addDays(from, PLAN_DAYS);

	const days = Array.from({ length: PLAN_DAYS }, (_, offset) => {
		const d = addDays(from, offset);
		const weekday = (d.getDay() + 6) % 7;
		return {
			date: formatDate(d),
			weekday,
			name: WEEKDAYS[weekday],
			isToday: formatDate(d) === formatDate(today)
		};
	});

	// Stepping back is clamped to today rather than hidden, so the button still
	// returns you to the live window from anywhere ahead of it.
	const prevFrom = addDays(from, -PLAN_DAYS);
	const range = {
		from: formatDate(from),
		last: formatDate(addDays(from, PLAN_DAYS - 1)),
		isCurrent: formatDate(from) === formatDate(today),
		prev:
			formatDate(from) === formatDate(today)
				? null
				: formatDate(prevFrom.getTime() < today.getTime() ? today : prevFrom),
		next: formatDate(to),
		days
	};

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
			activityCategoryId: activities.categoryId,
			label: weeklySlots.label,
			recurrence: weeklySlots.recurrence,
			urgency: weeklySlots.urgency,
			interest: weeklySlots.interest,
			energy: weeklySlots.energy,
			meta: weeklySlots.meta,
			active: weeklySlots.active
		})
		.from(weeklySlots)
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(activities, eq(weeklySlots.activityId, activities.id))
		.where(eq(weeklySlots.userId, userId))
		.orderBy(weeklySlots.weekday, weeklySlots.startTime)
		.all();

	const rangeSuppressions = db
		.select()
		.from(suppressedSlots)
		.where(
			and(
				eq(suppressedSlots.userId, userId),
				gte(suppressedSlots.date, formatDate(from)),
				lt(suppressedSlots.date, formatDate(to))
			)
		)
		.all();

	const rangeExceptionals = db
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
			activityCategoryId: activities.categoryId,
			label: exceptionalSlots.label,
			urgency: exceptionalSlots.urgency,
			interest: exceptionalSlots.interest,
			energy: exceptionalSlots.energy,
			meta: exceptionalSlots.meta,
			active: exceptionalSlots.active,
			// A one-off's status lives on its instance now, not on the block.
			status: sql<string>`coalesce(${taskInstances.status}, 'todo')`.as('one_off_status')
		})
		.from(exceptionalSlots)
		.leftJoin(categories, eq(exceptionalSlots.categoryId, categories.id))
		.leftJoin(activities, eq(exceptionalSlots.activityId, activities.id))
		.leftJoin(taskInstances, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
		.where(
			and(
				eq(exceptionalSlots.userId, userId),
				gte(exceptionalSlots.date, formatDate(from)),
				lt(exceptionalSlots.date, formatDate(to))
			)
		)
		.orderBy(exceptionalSlots.date, exceptionalSlots.startTime)
		.all();

	return {
		// So the metadata editor can say which plugin reads which key.
		plugins: listManifests(userId).map((m) => ({ name: m.name, metaKeys: m.metaKeys })),
		// Undated todos, so one can be dragged straight onto an hour.
		todos: listUnscheduled(buildCtx(userId)),
		slots,
		range,
		view,
		viewExplicit,
		categories: allCategories,
		activities: allActivities,
		schemes,
		weekdays: WEEKDAYS,
		today: formatDate(today),
		suppressions: rangeSuppressions,
		exceptionals: rangeExceptionals
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
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (weekday < 0 || weekday > 6) return fail(400, { message: 'Invalid weekday' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time format' });
		if (!mode) return fail(400, { message: 'Mode is required' });
		if (mode === 'category' && !categoryId) return fail(400, { message: 'Category required' });

		let activityId: number | null = null;
		if (mode === 'activity') {
			const resolved = resolveActivityId(userId, formData);
			if ('message' in resolved) return fail(400, { message: resolved.message });
			activityId = resolved.activityId;
			if (!activityId) return fail(400, { message: 'Activity required' });
		}

		const metaResult = readMeta(formData);
		if ('message' in metaResult) return fail(400, { message: metaResult.message });

		const inserted = db
			.insert(weeklySlots)
			.values({
				userId,
				weekday,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label,
				recurrence: readRecurrence(formData),
				...ratingsFromForm(formData),
				meta: metaResult.meta
			})
			.returning({ id: weeklySlots.id })
			.get();

		return { success: true, id: inserted.id };
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
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });
		const existing = db
			.select({ id: weeklySlots.id })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Slot not found' });

		let activityId: number | null = null;
		if (mode === 'activity') {
			const resolved = resolveActivityId(userId, formData);
			if ('message' in resolved) return fail(400, { message: resolved.message });
			activityId = resolved.activityId;
			if (!activityId) return fail(400, { message: 'Activity required' });
		}

		// `meta` is only touched when the request actually carried it. Drag and
		// resize post here with placement fields only, and must not clear it.
		const metaPatchResult = readMetaPatch(formData);
		if ('message' in metaPatchResult) return fail(400, { message: metaPatchResult.message });
		const metaPatch = metaPatchResult.meta;

		db.update(weeklySlots)
			.set({
				weekday,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label,
				...(metaPatch !== undefined ? { meta: metaPatch } : {}),
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

	/**
	 * Move one occurrence of a recurring block without moving the block.
	 *
	 * Modelled as the two things that already exist: the occurrence is skipped
	 * on its own date, and a one-off carrying the same identity is created at
	 * the new time. No new table and no third kind of thing — "this week is
	 * different" is exactly a skip plus a one-off, and both halves stay
	 * individually reversible.
	 */
	/**
	 * Turn a one-off into a recurring block, or a recurring block into a one-off.
	 *
	 * The two differ only in which day they name — a weekday versus a date — so
	 * changing your mind should not mean deleting one and retyping the other.
	 * Everything else about the block travels with it.
	 *
	 * A recurring block becoming a one-off keeps only the occurrence in the
	 * visible window; its other occurrences were never separate things, so there
	 * is nothing else to preserve.
	 */
	/** Drop an undated todo onto the grid: it becomes a block at that hour. */
	scheduleTodo: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const todoId = Number(formData.get('todoId'));
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 30);

		if (!todoId) return fail(400, { message: 'Missing todo id' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });

		const result = promoteTodo(buildCtx(userId), { todoId, date, startTime, durationMinutes });
		if (!result.ok) return fail(400, { message: result.message });

		return { success: true };
	},

	convertRepeat: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const to = formData.get('to')?.toString();
		const date = formData.get('date')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });
		if (to !== 'weekly' && to !== 'once') return fail(400, { message: 'Unknown target' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });

		if (to === 'weekly') {
			const one = db
				.select()
				.from(exceptionalSlots)
				.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
				.get();
			if (!one) return fail(404, { message: 'Block not found' });

			db.transaction((tx) => {
				tx.insert(weeklySlots)
					.values({
						userId,
						// The date it sits on decides which weekday it repeats on.
						weekday: (new Date(`${one.date}T00:00:00`).getDay() + 6) % 7,
						startTime: one.startTime,
						durationMinutes: one.durationMinutes,
						mode: one.mode,
						categoryId: one.categoryId,
						activityId: one.activityId,
						label: one.label,
						urgency: one.urgency,
						interest: one.interest,
						energy: one.energy,
						meta: one.meta
					})
					.run();

				// Cascades to the instance it produced; the new weekly slot
				// generates its own.
				tx.delete(exceptionalSlots)
					.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
					.run();
			});

			return { success: true };
		}

		const slot = db
			.select()
			.from(weeklySlots)
			.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
			.get();
		if (!slot) return fail(404, { message: 'Block not found' });

		db.transaction((tx) => {
			tx.insert(exceptionalSlots)
				.values({
					userId,
					date,
					startTime: slot.startTime,
					durationMinutes: slot.durationMinutes,
					mode: slot.mode,
					categoryId: slot.categoryId,
					activityId: slot.activityId,
					label: slot.label,
					urgency: slot.urgency,
					interest: slot.interest,
					energy: slot.energy,
					meta: slot.meta
				})
				.run();

			tx.delete(taskInstances)
				.where(and(eq(taskInstances.userId, userId), eq(taskInstances.slotId, id)))
				.run();
			tx.delete(suppressedSlots)
				.where(and(eq(suppressedSlots.userId, userId), eq(suppressedSlots.slotId, id)))
				.run();
			tx.delete(weeklySlots)
				.where(and(eq(weeklySlots.id, id), eq(weeklySlots.userId, userId)))
				.run();
		});

		return { success: true };
	},

	moveOccurrence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const slotId = Number(formData.get('slotId'));
		const fromDate = formData.get('fromDate')?.toString()?.trim() ?? '';
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);

		if (!slotId) return fail(400, { message: 'Missing slot id' });
		if (!fromDate.match(/^\d{4}-\d{2}-\d{2}$/))
			return fail(400, { message: 'Invalid source date' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });

		const slot = db
			.select()
			.from(weeklySlots)
			.where(and(eq(weeklySlots.id, slotId), eq(weeklySlots.userId, userId)))
			.get();
		if (!slot) return fail(404, { message: 'Block not found' });

		const created = db.transaction((tx) => {
			const already = tx
				.select({ id: suppressedSlots.id })
				.from(suppressedSlots)
				.where(
					and(
						eq(suppressedSlots.userId, userId),
						eq(suppressedSlots.slotId, slotId),
						eq(suppressedSlots.date, fromDate)
					)
				)
				.get();

			// Deleted and re-inserted rather than updated, because the same day may
			// already carry a plain skip and this has to become a move.
			if (already) {
				tx.delete(suppressedSlots).where(eq(suppressedSlots.id, already.id)).run();
			}

			// The instance the skipped occurrence produced would otherwise linger
			// as a task for a block that is no longer on that day.
			tx.delete(taskInstances)
				.where(
					and(
						eq(taskInstances.userId, userId),
						eq(taskInstances.slotId, slotId),
						gte(taskInstances.scheduledAt, `${fromDate}T00:00:00`),
						lt(taskInstances.scheduledAt, `${fromDate}T23:59:59`)
					)
				)
				.run();

			const moved = tx
				.insert(exceptionalSlots)
				.values({
					userId,
					date,
					startTime,
					durationMinutes,
					mode: slot.mode,
					categoryId: slot.categoryId,
					activityId: slot.activityId,
					label: slot.label,
					urgency: slot.urgency,
					interest: slot.interest,
					energy: slot.energy,
					meta: slot.meta
				})
				.returning({ id: exceptionalSlots.id })
				.get();

			tx.insert(suppressedSlots)
				.values({ userId, slotId, date: fromDate, movedToId: moved.id })
				.run();

			return moved;
		});

		return { success: true, id: created.id };
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

		db.insert(suppressedSlots).values({ userId, date, slotId }).run();

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
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });
		if (!mode) return fail(400, { message: 'Mode is required' });
		if (mode === 'category' && !categoryId) return fail(400, { message: 'Category required' });

		let activityId: number | null = null;
		if (mode === 'activity') {
			const resolved = resolveActivityId(userId, formData);
			if ('message' in resolved) return fail(400, { message: resolved.message });
			activityId = resolved.activityId;
			if (!activityId) return fail(400, { message: 'Activity required' });
		}

		const excMeta = readMeta(formData);
		if ('message' in excMeta) return fail(400, { message: excMeta.message });

		const inserted = db
			.insert(exceptionalSlots)
			.values({
				userId,
				date,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label,
				...ratingsFromForm(formData),
				meta: excMeta.meta
			})
			.returning({ id: exceptionalSlots.id })
			.get();

		return { success: true, id: inserted.id };
	},

	updateExceptional: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);
		const mode = formData.get('mode')?.toString() as 'category' | 'activity';
		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const label = formData.get('label')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });
		if (!mode) return fail(400, { message: 'Mode is required' });
		if (mode === 'category' && !categoryId) return fail(400, { message: 'Category required' });

		const existing = db
			.select({ id: exceptionalSlots.id })
			.from(exceptionalSlots)
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Exception not found' });

		let activityId: number | null = null;
		if (mode === 'activity') {
			const resolved = resolveActivityId(userId, formData);
			if ('message' in resolved) return fail(400, { message: resolved.message });
			activityId = resolved.activityId;
			if (!activityId) return fail(400, { message: 'Activity required' });
		}

		// Same rule as `update`: a drag or resize carries placement only, and must
		// leave any metadata on the block untouched.
		const metaPatchResult = readMetaPatch(formData);
		if ('message' in metaPatchResult) return fail(400, { message: metaPatchResult.message });
		const metaPatch = metaPatchResult.meta;

		db.update(exceptionalSlots)
			.set({
				date,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label,
				// A drag posts placement only, so leave the rule alone unless the
				// form actually sent one.
				...(formData.has('recurrenceKind') ? { recurrence: readRecurrence(formData) } : {}),
				...ratingsFromForm(formData),
				...(metaPatch !== undefined ? { meta: metaPatch } : {})
			})
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	deleteExceptional: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		const existing = db
			.select({ id: exceptionalSlots.id })
			.from(exceptionalSlots)
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Exception not found' });

		db.delete(exceptionalSlots)
			.where(and(eq(exceptionalSlots.id, id), eq(exceptionalSlots.userId, userId)))
			.run();

		return { success: true };
	},

	importCsv: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const csv = formData.get('csv')?.toString()?.trim() ?? '';
		const clearExisting = formData.get('clearExisting') === 'on';

		if (!csv) return fail(400, { message: 'CSV content is required' });

		const lines = csv
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
		if (lines.length < 2)
			return fail(400, { message: 'CSV must have a header and at least one row' });

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
			if (cells.length < 3) continue;

			const timeCode = cells[0];
			// Parse time: 610 -> 06:10, 1810 -> 18:10
			const padded = timeCode.padStart(4, '0');
			const hours = padded.slice(0, -2);
			const minutes = padded.slice(-2);
			const startTime = `${hours.padStart(2, '0')}:${minutes}`;

			if (!/^\d{2}:\d{2}$/.test(startTime)) continue;

			const durationMinutes = Number(cells[1]) || 60;

			for (let day = 0; day < 7 && day + 2 < cells.length; day++) {
				const cellValue = cells[day + 2].trim();
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
						.where(
							and(inArray(suppressedSlots.slotId, slotIds), eq(suppressedSlots.userId, userId))
						)
						.run();
				}
				tx.delete(weeklySlots).where(eq(weeklySlots.userId, userId)).run();
			}

			for (const slot of slotsToInsert) {
				tx.insert(weeklySlots).values(slot).run();
			}
		});

		if (notFound.length > 0) {
			return {
				success: true,
				message: `Imported ${slotsToInsert.length} slots. Activities not found (used as labels): ${notFound.join(', ')}`
			};
		}

		return { success: true, message: `Imported ${slotsToInsert.length} slots.` };
	}
};
