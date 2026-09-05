import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { ratingsFromForm, type RatingValues } from '../../ratings.js';
import {
	formatDate as recFormatDate,
	parseRecurrence,
	serialiseRecurrence
} from '../../recurrence.js';
import { db } from '../db/index.js';
import {
	activities,
	categories,
	exceptionalTasks,
	recipes,
	reminders,
	suppressedSlots,
	taskRecords,
	recurringTasks
} from '../db/schema.js';
import { localDateOf, type Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { created, stamp, stamps } from './time.js';
import { TIME_PATTERN, num, oneOf, optionalStr, str } from './validate.js';

/**
 * The plan itself: blocks that repeat (`recurring_tasks`) and blocks that happen
 * once (`exceptional_tasks`), plus the skips that cancel a single occurrence.
 *
 * What any of it produces on a given day is `services/instances.ts`. This
 * module owns the shape of the plan; that one owns what the plan means for a
 * date.
 */

export const MODES = ['category', 'activity'] as const;
export type Mode = (typeof MODES)[number];

export const MAX_LABEL_LENGTH = 300;
export const MAX_ACTIVITY_NAME_LENGTH = 100;
export const MAX_CSV_LENGTH = 100_000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Submitted by the activity picker when the user wants to create one inline. */
export const NEW_ACTIVITY_VALUE = '__new__';

export type BlockInput = {
	startTime: unknown;
	durationMinutes?: unknown;
	/** Minutes before the start to be reminded. Absent or 0 is no reminder. */
	remindLeadMinutes?: unknown;
	mode: unknown;
	categoryId?: unknown;
	activityId?: unknown;
	newActivityName?: unknown;
	newActivityCategoryId?: unknown;
	label?: unknown;
	ratings?: Partial<RatingValues>;
	meta?: string;
	/** Undefined leaves an existing value alone; a drag posts placement only. */
	metaPatch?: string | undefined;
	recurrence?: string;
};

// --- Reads --------------------------------------------------------------------

export function listActiveWeeklySlots(ctx: Ctx) {
	return db
		.select({
			id: recurringTasks.id,
			weekday: recurringTasks.weekday,
			startTime: recurringTasks.startTime,
			durationMinutes: recurringTasks.durationMinutes,
			mode: recurringTasks.mode,
			label: recurringTasks.label,
			activityName: activities.name,
			categoryName: categories.name,
			categoryColor: categories.color
		})
		.from(recurringTasks)
		.leftJoin(activities, eq(recurringTasks.activityId, activities.id))
		.leftJoin(categories, eq(recurringTasks.categoryId, categories.id))
		.where(and(eq(recurringTasks.userId, ctx.userId), eq(recurringTasks.active, true)))
		.orderBy(recurringTasks.startTime)
		.all();
}

/** Every weekly block, active or not — the grid draws the inactive ones faded. */
export function listWeeklySlots(ctx: Ctx) {
	return db
		.select({
			id: recurringTasks.id,
			weekday: recurringTasks.weekday,
			startTime: recurringTasks.startTime,
			durationMinutes: recurringTasks.durationMinutes,
			remindLeadMinutes: recurringTasks.remindLeadMinutes,
			mode: recurringTasks.mode,
			categoryId: recurringTasks.categoryId,
			categoryName: categories.name,
			activityId: recurringTasks.activityId,
			activityName: activities.name,
			activityCategoryId: activities.categoryId,
			label: recurringTasks.label,
			recurrence: recurringTasks.recurrence,
			urgency: recurringTasks.urgency,
			interest: recurringTasks.interest,
			energy: recurringTasks.energy,
			meta: recurringTasks.meta,
			active: recurringTasks.active
		})
		.from(recurringTasks)
		.leftJoin(categories, eq(recurringTasks.categoryId, categories.id))
		.leftJoin(activities, eq(recurringTasks.activityId, activities.id))
		.where(eq(recurringTasks.userId, ctx.userId))
		.orderBy(recurringTasks.weekday, recurringTasks.startTime)
		.all();
}

export function listSuppressions(ctx: Ctx, from: string, to: string) {
	return db
		.select()
		.from(suppressedSlots)
		.where(
			and(
				eq(suppressedSlots.userId, ctx.userId),
				gte(suppressedSlots.date, from),
				lt(suppressedSlots.date, to)
			)
		)
		.all();
}

export function listExceptionals(ctx: Ctx, from: string, to: string) {
	return db
		.select({
			id: exceptionalTasks.id,
			date: exceptionalTasks.date,
			startTime: exceptionalTasks.startTime,
			durationMinutes: exceptionalTasks.durationMinutes,
			remindLeadMinutes: exceptionalTasks.remindLeadMinutes,
			mode: exceptionalTasks.mode,
			categoryId: exceptionalTasks.categoryId,
			categoryName: categories.name,
			activityId: exceptionalTasks.activityId,
			activityName: activities.name,
			activityCategoryId: activities.categoryId,
			label: exceptionalTasks.label,
			urgency: exceptionalTasks.urgency,
			interest: exceptionalTasks.interest,
			energy: exceptionalTasks.energy,
			meta: exceptionalTasks.meta,
			active: exceptionalTasks.active,
			// A one-off's status lives on its instance now, not on the block.
			status: sql<string>`coalesce(${taskRecords.status}, 'todo')`.as('one_off_status')
		})
		.from(exceptionalTasks)
		.leftJoin(categories, eq(exceptionalTasks.categoryId, categories.id))
		.leftJoin(activities, eq(exceptionalTasks.activityId, activities.id))
		.leftJoin(taskRecords, eq(taskRecords.exceptionalSlotId, exceptionalTasks.id))
		.where(
			and(
				eq(exceptionalTasks.userId, ctx.userId),
				gte(exceptionalTasks.date, from),
				lt(exceptionalTasks.date, to)
			)
		)
		.orderBy(exceptionalTasks.date, exceptionalTasks.startTime)
		.all();
}

// --- Weekly blocks ------------------------------------------------------------

export function createSlot(ctx: Ctx, raw: BlockInput & { weekday: unknown }): number {
	const placement = parseBlock(ctx, raw);
	const weekday = num(raw.weekday, 'weekday', { int: true, min: 0, max: 6 });

	const inserted = db
		.insert(recurringTasks)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			weekday,
			...placement,
			recurrence: raw.recurrence ?? 'weekly',
			...(raw.ratings ?? {}),
			meta: raw.meta ?? '{}'
		})
		.returning({ id: recurringTasks.id })
		.get();

	return inserted.id;
}

export function updateSlot(ctx: Ctx, id: number, raw: BlockInput & { weekday: unknown }): void {
	const placement = parseBlock(ctx, raw);
	const weekday = num(raw.weekday, 'weekday', { int: true, min: 0, max: 6 });

	// What it was, before it moves: the days already generated from it carry
	// their own copy of the start time, and something has to bring them along.
	const before = db
		.select({ weekday: recurringTasks.weekday, startTime: recurringTasks.startTime })
		.from(recurringTasks)
		.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
		.get();

	const res = db
		.update(recurringTasks)
		.set({
			weekday,
			...placement,
			// `meta` is only touched when the request actually carried it. Drag and
			// resize post placement fields only, and must not clear it.
			...(raw.metaPatch !== undefined ? { meta: raw.metaPatch } : {}),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('slot');
	if (before) moveGeneratedDays(ctx, id, before, { weekday, startTime: placement.startTime });
}

/**
 * Bring the already-generated days along when the template moves.
 *
 * A week is generated ahead of itself, and each occurrence stores its own
 * `scheduled_at` — which is what the calendar feed publishes and what every
 * reminder was armed from. Moving the repeating block changed the template
 * and left those rows behind: the API answered with the new `start_time` and
 * the old `at_local` for the same occurrence, an assistant that moved
 * somebody's morning saw it unmoved, the calendar app kept showing the old
 * hour, and the alarm still went off at it.
 *
 * Only days from today onward move. What already happened happened at the
 * time it happened, and a history that rewrites itself is worse than one that
 * disagrees with the template.
 */
function moveGeneratedDays(
	ctx: Ctx,
	slotId: number,
	before: { weekday: number; startTime: string },
	after: { weekday: number; startTime: string }
): void {
	if (before.weekday === after.weekday && before.startTime === after.startTime) return;

	const from = `${localDateOf(ctx.now, ctx.tz)}T00:00:00`;

	if (before.weekday !== after.weekday) {
		/*
		 * A different day of the week: these occurrences are on dates that no
		 * longer belong to the block at all, so they go and the next generation
		 * puts them where they now belong. Only the untouched ones — an
		 * occurrence somebody has marked done or renamed is a record of their day.
		 */
		const stale = db
			.select({ id: taskRecords.id })
			.from(taskRecords)
			.where(
				and(
					eq(taskRecords.userId, ctx.userId),
					eq(taskRecords.slotId, slotId),
					gte(taskRecords.scheduledAt, from),
					eq(taskRecords.status, 'todo')
				)
			)
			.all()
			.map((r) => r.id);

		if (stale.length > 0) {
			db.delete(reminders)
				.where(
					and(
						eq(reminders.userId, ctx.userId),
						eq(reminders.subjectKind, 'instance'),
						inArray(reminders.subjectId, stale)
					)
				)
				.run();
			db.delete(taskRecords).where(inArray(taskRecords.id, stale)).run();
		}
		return;
	}

	// Same days, new time: the occurrences stay, their clock moves — and the
	// reminders armed off the old time move with them rather than firing at it.
	const moving = db
		.select({ id: taskRecords.id, scheduledAt: taskRecords.scheduledAt })
		.from(taskRecords)
		.where(
			and(
				eq(taskRecords.userId, ctx.userId),
				eq(taskRecords.slotId, slotId),
				gte(taskRecords.scheduledAt, from)
			)
		)
		.all();

	for (const row of moving) {
		const moved = `${row.scheduledAt.slice(0, 10)}T${after.startTime}:00`;
		db.update(taskRecords).set({ scheduledAt: moved }).where(eq(taskRecords.id, row.id)).run();

		const shift = minutesBetween(row.scheduledAt, moved);
		if (shift === 0) continue;
		const armed = db
			.select({ id: reminders.id, remindAt: reminders.remindAt })
			.from(reminders)
			.where(
				and(
					eq(reminders.userId, ctx.userId),
					eq(reminders.subjectKind, 'instance'),
					eq(reminders.subjectId, row.id),
					isNull(reminders.deliveredAt)
				)
			)
			.all();
		for (const reminder of armed) {
			db.update(reminders)
				.set({ remindAt: addMinutesTo(reminder.remindAt, shift) })
				.where(eq(reminders.id, reminder.id))
				.run();
		}
	}
}

/** Wall-clock minutes from one naive local stamp to another. */
function minutesBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / 60000);
}

function addMinutesTo(stampAt: string, minutes: number): string {
	const shifted = new Date(Date.parse(`${stampAt}Z`) + minutes * 60000);
	return shifted.toISOString().slice(0, 19);
}

export function toggleSlotActive(ctx: Ctx, id: number): void {
	const current = db
		.select({ active: recurringTasks.active })
		.from(recurringTasks)
		.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
		.get();

	if (!current) throw new NotFoundError('slot');

	db.update(recurringTasks)
		.set({ active: !current.active, updatedAt: stamp(ctx) })
		.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
		.run();
}

export function deleteSlots(ctx: Ctx, ids: number[]): void {
	const wanted = ids.filter((n) => Number.isFinite(n) && n > 0);
	if (wanted.length === 0) throw new ValidationError('No slots selected');

	const owned = db
		.select({ id: recurringTasks.id })
		.from(recurringTasks)
		.where(and(inArray(recurringTasks.id, wanted), eq(recurringTasks.userId, ctx.userId)))
		.all()
		.map((s) => s.id);

	if (owned.length === 0) throw new NotFoundError('slot');

	db.transaction((tx) => {
		tx.delete(taskRecords)
			.where(and(inArray(taskRecords.slotId, owned), eq(taskRecords.userId, ctx.userId)))
			.run();
		tx.delete(suppressedSlots)
			.where(and(inArray(suppressedSlots.slotId, owned), eq(suppressedSlots.userId, ctx.userId)))
			.run();
		tx.delete(recurringTasks)
			.where(and(inArray(recurringTasks.id, owned), eq(recurringTasks.userId, ctx.userId)))
			.run();
	});
}

/** Same block, other days. A day the block already sits on is skipped. */
export function copySlotsToWeekdays(ctx: Ctx, ids: number[], days: number[]): void {
	const wanted = ids.filter((n) => Number.isFinite(n) && n > 0);
	const targetDays = days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

	if (wanted.length === 0) throw new ValidationError('No slots selected');
	if (targetDays.length === 0) throw new ValidationError('No target days selected');

	const sources = db
		.select()
		.from(recurringTasks)
		.where(and(inArray(recurringTasks.id, wanted), eq(recurringTasks.userId, ctx.userId)))
		.all();

	if (sources.length === 0) throw new NotFoundError('slot');

	db.transaction((tx) => {
		for (const slot of sources) {
			for (const day of targetDays) {
				if (day === slot.weekday) continue;
				tx.insert(recurringTasks)
					.values({
						...stamps(ctx),
						userId: ctx.userId,
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
	});
}

/** Empty the weekly plan, and everything the blocks produced. */
export function clearWeeklyPlan(ctx: Ctx): void {
	db.transaction((tx) => clearWeeklyPlanIn(tx, ctx));
}

/** The same, inside a transaction someone else opened. */
export function clearWeeklyPlanIn(tx: TxLike, ctx: Ctx): void {
	const slotIds = tx
		.select({ id: recurringTasks.id })
		.from(recurringTasks)
		.where(eq(recurringTasks.userId, ctx.userId))
		.all()
		.map((slot: { id: number }) => slot.id);

	if (slotIds.length > 0) {
		tx.delete(taskRecords)
			.where(and(inArray(taskRecords.slotId, slotIds), eq(taskRecords.userId, ctx.userId)))
			.run();
		tx.delete(suppressedSlots)
			.where(and(inArray(suppressedSlots.slotId, slotIds), eq(suppressedSlots.userId, ctx.userId)))
			.run();
	}

	tx.delete(recurringTasks).where(eq(recurringTasks.userId, ctx.userId)).run();
}

/** Drizzle's transaction object, structurally — enough to run these statements. */
type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0];

// --- One-off blocks -----------------------------------------------------------

export function createExceptional(
	ctx: Ctx,
	raw: BlockInput & { date: unknown; recipeId?: unknown }
): number {
	const placement = parseBlock(ctx, raw);
	const date = requiredDate(raw.date);

	const inserted = db
		.insert(exceptionalTasks)
		.values({
			...created(ctx),
			userId: ctx.userId,
			date,
			...placement,
			// A meal is a block with something to cook attached, which is why it
			// appears on the plan next to everything else rather than on a
			// calendar of its own.
			recipeId: ownedRecipeId(ctx, raw.recipeId),
			...(raw.ratings ?? {}),
			meta: raw.meta ?? '{}'
		})
		.returning({ id: exceptionalTasks.id })
		.get();

	return inserted.id;
}

export function updateExceptional(ctx: Ctx, id: number, raw: BlockInput & { date: unknown }): void {
	const placement = parseBlock(ctx, raw);
	const date = requiredDate(raw.date);

	const res = db
		.update(exceptionalTasks)
		.set({
			date,
			...placement,
			// A drag posts placement only, so leave the rule alone unless the form
			// actually sent one.
			...(raw.recurrence !== undefined ? { recurrence: raw.recurrence } : {}),
			...(raw.ratings ?? {}),
			...(raw.metaPatch !== undefined ? { meta: raw.metaPatch } : {})
		})
		.where(and(eq(exceptionalTasks.id, id), eq(exceptionalTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('exception');
}

export function deleteExceptional(ctx: Ctx, id: number): void {
	const res = db
		.delete(exceptionalTasks)
		.where(and(eq(exceptionalTasks.id, id), eq(exceptionalTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('exception');
}

// --- One occurrence -----------------------------------------------------------

/** Skip one occurrence of a recurring block. Skipping twice is not an error. */
export function suppressOccurrence(ctx: Ctx, slotId: number, rawDate: unknown): void {
	const date = requiredDate(rawDate);
	assertOwnedSlot(ctx, slotId);

	const existing = db
		.select({ id: suppressedSlots.id })
		.from(suppressedSlots)
		.where(
			and(
				eq(suppressedSlots.userId, ctx.userId),
				eq(suppressedSlots.slotId, slotId),
				eq(suppressedSlots.date, date)
			)
		)
		.get();

	if (existing) return;

	db.insert(suppressedSlots).values({ userId: ctx.userId, date, slotId }).run();
}

export function unsuppressOccurrence(ctx: Ctx, slotId: number, rawDate: unknown): void {
	const date = requiredDate(rawDate);

	db.delete(suppressedSlots)
		.where(
			and(
				eq(suppressedSlots.userId, ctx.userId),
				eq(suppressedSlots.slotId, slotId),
				eq(suppressedSlots.date, date)
			)
		)
		.run();
}

/**
 * Move one occurrence of a recurring block without moving the block.
 *
 * Modelled as the two things that already exist: the occurrence is skipped on
 * its own date, and a one-off carrying the same identity is created at the new
 * time. No new table and no third kind of thing — "this week is different" is
 * exactly a skip plus a one-off, and both halves stay individually reversible.
 */
export function moveOccurrence(
	ctx: Ctx,
	raw: {
		slotId: number;
		fromDate: unknown;
		date: unknown;
		startTime: unknown;
		durationMinutes?: unknown;
	}
): number {
	const fromDate = requiredDate(raw.fromDate, 'source date');
	const date = requiredDate(raw.date);
	const startTime = str(raw.startTime, 'time', { max: 5, pattern: TIME_PATTERN });
	const durationMinutes = parseDuration(raw.durationMinutes, 60);

	const slot = db
		.select()
		.from(recurringTasks)
		.where(and(eq(recurringTasks.id, raw.slotId), eq(recurringTasks.userId, ctx.userId)))
		.get();

	if (!slot) throw new NotFoundError('block');

	return db.transaction((tx) => {
		const already = tx
			.select({ id: suppressedSlots.id })
			.from(suppressedSlots)
			.where(
				and(
					eq(suppressedSlots.userId, ctx.userId),
					eq(suppressedSlots.slotId, raw.slotId),
					eq(suppressedSlots.date, fromDate)
				)
			)
			.get();

		// Deleted and re-inserted rather than updated, because the same day may
		// already carry a plain skip and this has to become a move.
		if (already) tx.delete(suppressedSlots).where(eq(suppressedSlots.id, already.id)).run();

		// The instance the skipped occurrence produced would otherwise linger as a
		// task for a block that is no longer on that day.
		tx.delete(taskRecords)
			.where(
				and(
					eq(taskRecords.userId, ctx.userId),
					eq(taskRecords.slotId, raw.slotId),
					gte(taskRecords.scheduledAt, `${fromDate}T00:00:00`),
					lt(taskRecords.scheduledAt, `${fromDate}T23:59:59`)
				)
			)
			.run();

		const moved = tx
			.insert(exceptionalTasks)
			.values({
				...created(ctx),
				userId: ctx.userId,
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
			.returning({ id: exceptionalTasks.id })
			.get();

		tx.insert(suppressedSlots)
			.values({ userId: ctx.userId, slotId: raw.slotId, date: fromDate, movedToId: moved.id })
			.run();

		return moved.id;
	});
}

/**
 * Turn a one-off into a recurring block, or a recurring block into a one-off.
 *
 * The two differ only in which day they name — a weekday versus a date — so
 * changing your mind should not mean deleting one and retyping the other.
 * Everything else about the block travels with it.
 *
 * A recurring block becoming a one-off keeps only the occurrence in the visible
 * window; its other occurrences were never separate things, so there is nothing
 * else to preserve.
 */
export function convertRepeat(ctx: Ctx, id: number, raw: { to: unknown; date: unknown }): void {
	const to = oneOf(raw.to, 'target', ['weekly', 'once'] as const);
	const date = requiredDate(raw.date);

	if (to === 'weekly') {
		const one = db
			.select()
			.from(exceptionalTasks)
			.where(and(eq(exceptionalTasks.id, id), eq(exceptionalTasks.userId, ctx.userId)))
			.get();

		if (!one) throw new NotFoundError('block');

		db.transaction((tx) => {
			tx.insert(recurringTasks)
				.values({
					...stamps(ctx),
					userId: ctx.userId,
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

			// Cascades to the instance it produced; the new weekly slot generates
			// its own.
			tx.delete(exceptionalTasks)
				.where(and(eq(exceptionalTasks.id, id), eq(exceptionalTasks.userId, ctx.userId)))
				.run();
		});

		return;
	}

	const slot = db
		.select()
		.from(recurringTasks)
		.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
		.get();

	if (!slot) throw new NotFoundError('block');

	db.transaction((tx) => {
		tx.insert(exceptionalTasks)
			.values({
				...created(ctx),
				userId: ctx.userId,
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

		tx.delete(taskRecords)
			.where(and(eq(taskRecords.userId, ctx.userId), eq(taskRecords.slotId, id)))
			.run();
		tx.delete(suppressedSlots)
			.where(and(eq(suppressedSlots.userId, ctx.userId), eq(suppressedSlots.slotId, id)))
			.run();
		tx.delete(recurringTasks)
			.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
			.run();
	});
}

// --- Import -------------------------------------------------------------------

export type CsvImportResult = { imported: number; unmatched: string[] };

/**
 * A week as a grid: start time, duration, then one column per weekday.
 *
 * A cell naming an activity becomes an activity block; anything else becomes a
 * category block carrying the text as its label, and is reported back so the
 * user knows what was not recognised rather than silently losing it.
 */
export function importWeekCsv(
	ctx: Ctx,
	raw: { csv: unknown; clearExisting?: boolean }
): CsvImportResult {
	const csv = str(raw.csv, 'CSV content', { max: MAX_CSV_LENGTH });

	const lines = csv
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length < 2) throw new ValidationError('CSV must have a header and at least one row');

	const known = new Map(
		db
			.select({ id: activities.id, name: activities.name })
			.from(activities)
			.where(eq(activities.userId, ctx.userId))
			.all()
			.map((a) => [a.name.toLowerCase(), a.id])
	);

	// A cell that names no activity still becomes a block, carrying its text as
	// a label — but a category-mode block must name a category, so it is filed
	// under the first one. The old code left it null and the insert failed the
	// check constraint, which is why importing a sheet with any unrecognised
	// cell died with a 500.
	const fallbackCategory = db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.userId, ctx.userId))
		.orderBy(categories.name)
		.get()?.id;

	const rows: {
		userId: string;
		weekday: number;
		startTime: string;
		durationMinutes: number;
		mode: Mode;
		activityId: number | null;
		categoryId: number | null;
		label: string;
	}[] = [];
	const unmatched: string[] = [];

	for (const line of lines.slice(1)) {
		const cells = line.split(',').map((c) => c.trim());
		if (cells.length < 3) continue;

		// 610 -> 06:10, 1810 -> 18:10
		const padded = cells[0].padStart(4, '0');
		const startTime = `${padded.slice(0, -2).padStart(2, '0')}:${padded.slice(-2)}`;
		if (!TIME_PATTERN.test(startTime)) continue;

		const durationMinutes = Number(cells[1]) || 60;

		for (let day = 0; day < 7 && day + 2 < cells.length; day++) {
			const cell = cells[day + 2].trim();
			if (!cell) continue;

			const activityId = known.get(cell.toLowerCase());
			if (!activityId && !fallbackCategory)
				throw new ValidationError(
					`No activity called "${cell}", and no category to file it under. Create a category first.`
				);

			rows.push({
				userId: ctx.userId,
				weekday: day,
				startTime,
				durationMinutes,
				mode: activityId ? 'activity' : 'category',
				activityId: activityId ?? null,
				categoryId: activityId ? null : (fallbackCategory ?? null),
				label: activityId ? '' : cell.slice(0, MAX_LABEL_LENGTH)
			});

			if (!activityId && !unmatched.includes(cell)) unmatched.push(cell);
		}
	}

	if (rows.length === 0) throw new ValidationError('No valid slots found in CSV');

	db.transaction((tx) => {
		if (raw.clearExisting) clearWeeklyPlanIn(tx, ctx);
		for (const row of rows) tx.insert(recurringTasks).values(row).run();
	});

	return { imported: rows.length, unmatched };
}

// --- Parsing ------------------------------------------------------------------

/**
 * The recurrence rule from a block form.
 *
 * Every-N shapes need an anchor to count from; the form supplies the block's
 * own date when it has one, and today otherwise, so "every 2 weeks" starts
 * counting from the occurrence you were looking at.
 */
export function readRecurrence(formData: FormData, now: Date): string {
	const kind = formData.get('recurrenceKind')?.toString() ?? 'weekly';
	const interval = Number(formData.get('recurrenceInterval') || 1);
	const anchor = formData.get('recurrenceAnchor')?.toString()?.trim() || recFormatDate(now);
	const monthDay = Number(formData.get('recurrenceMonthDay') || 1);

	if (kind === 'weeks' || kind === 'days') {
		// Round-tripping through the parser is the validation: anything out of
		// range comes back as plain weekly rather than reaching the database.
		return serialiseRecurrence(parseRecurrence(`${kind}:${interval}:${anchor}`));
	}
	if (kind === 'monthly') return serialiseRecurrence(parseRecurrence(`monthly:${monthDay}`));
	return 'weekly';
}

export { ratingsFromForm };

/**
 * How long before this starts to be reminded.
 *
 * A lead rather than a time, because that is the only thing anybody says about
 * a reminder on something already on a calendar. Empty and "0" both mean no
 * reminder — a nudge at the exact moment a thing starts is not a nudge.
 *
 * Three answers, not two. `undefined` means the form did not mention it at
 * all, and the field is then left alone: a drag or a resize posts placement
 * only, and must not silently take somebody's reminder off a block they were
 * only moving. Same rule as `meta` below.
 */
function parseRemindLead(raw: unknown): number | null | undefined {
	if (raw === undefined) return undefined;
	if (raw === null || raw === '') return null;
	const minutes = num(raw, 'reminder', { int: true, min: 0, max: 24 * 60 });
	return minutes > 0 ? minutes : null;
}

/** Placement and identity, shared by both kinds of block. */
function parseBlock(ctx: Ctx, raw: BlockInput) {
	const mode = oneOf(raw.mode, 'mode', MODES);
	const startTime = str(raw.startTime, 'time', { max: 5, pattern: TIME_PATTERN });
	const durationMinutes = parseDuration(raw.durationMinutes, 60);
	const label = optionalStr(raw.label, 'label', { max: MAX_LABEL_LENGTH });
	const remindLeadMinutes = parseRemindLead(raw.remindLeadMinutes);

	const categoryId = ownedCategoryId(ctx, raw.categoryId);
	if (mode === 'category' && !categoryId) throw new ValidationError('Category required');

	const activityId = mode === 'activity' ? resolveActivityId(ctx, raw) : null;
	if (mode === 'activity' && !activityId) throw new ValidationError('Activity required');

	return {
		startTime,
		durationMinutes,
		mode,
		categoryId,
		activityId,
		label,
		...(remindLeadMinutes === undefined ? {} : { remindLeadMinutes })
	};
}

/** A recipe id from a form is a number until it is checked against the owner. */
function ownedRecipeId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'recipe', { int: true, min: 1 });
	const owned = db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('recipe');
	return owned.id;
}

/**
 * The submitted activity as an id, creating it when "+ New activity" was
 * picked. An activity that already exists under the same name is reused rather
 * than duplicated.
 */
function resolveActivityId(ctx: Ctx, raw: BlockInput): number | null {
	const submitted =
		raw.activityId === undefined || raw.activityId === null ? '' : String(raw.activityId).trim();

	if (submitted !== NEW_ACTIVITY_VALUE) return submitted ? ownedActivityId(ctx, submitted) : null;

	const name = str(raw.newActivityName, 'Activity name', { max: MAX_ACTIVITY_NAME_LENGTH });
	const categoryId = ownedCategoryId(ctx, raw.newActivityCategoryId);
	if (!categoryId) throw new ValidationError('Category is required for the new activity');

	const existing = db
		.select({ id: activities.id })
		.from(activities)
		.where(and(eq(activities.userId, ctx.userId), sql`lower(${activities.name}) = lower(${name})`))
		.get();

	if (existing) return existing.id;

	return db
		.insert(activities)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			name,
			categoryId
		})
		.returning({ id: activities.id })
		.get().id;
}

function assertOwnedSlot(ctx: Ctx, id: number): void {
	const owned = db
		.select({ id: recurringTasks.id })
		.from(recurringTasks)
		.where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('slot');
}

function ownedCategoryId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'category', { int: true, min: 1 });
	const owned = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('category');
	return id;
}

function ownedActivityId(ctx: Ctx, value: unknown): number | null {
	const id = num(value, 'activity', { int: true, min: 1 });
	const owned = db
		.select({ id: activities.id })
		.from(activities)
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('activity');
	return id;
}

function parseDuration(value: unknown, fallback: number): number {
	if (value === undefined || value === null || String(value).trim() === '') return fallback;
	return num(value, 'duration', { int: true, min: 1, max: 24 * 60 });
}

function requiredDate(value: unknown, field = 'date'): string {
	return str(value, field, { max: 10, pattern: DATE_PATTERN });
}
