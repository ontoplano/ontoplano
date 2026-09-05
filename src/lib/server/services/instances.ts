/**
 * The one answer to "what is on, between these dates".
 *
 * Both kinds of planned block — a recurring weekly slot and a one-off — produce
 * rows in `task_records`, and this module is the only place that knows how to
 * generate and read them. Before it existed each caller wrote its own union of
 * two tables, and the ones that forgot the second half were quietly wrong: the
 * dashboard omitted one-offs entirely and the tracker's day tabs counted a
 * different set of tasks than the list beneath them displayed.
 */
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { db } from '../db/index.js';
import { isStatus } from '../../task-status.js';
import type { Ctx } from './ctx.js';
import { createReminder } from './reminders.js';
import {
	deleteExceptional,
	moveOccurrence,
	suppressOccurrence,
	updateExceptional
} from './slots.js';
import { NotFoundError, ValidationError } from './errors.js';
// `created` is also a local counter in this file, hence the alias.
import { created as createdStamp, stamp } from './time.js';
import { TIME_PATTERN, num, optionalStr, str } from './validate.js';
import {
	activities,
	categories,
	exceptionalTasks,
	suppressedSlots,
	taskRecords,
	recurringTasks
} from '../db/schema.js';

import type { Status } from '../../task-status.js';
import type { RatingValues } from '../../ratings.js';
import { occursOn, parseRecurrence } from '../../recurrence.js';

/** A single occurrence, whichever kind of block produced it. */
export type Occurrence = {
	id: number;
	kind: 'weekly' | 'once';
	slotId: number | null;
	exceptionalSlotId: number | null;
	scheduledAt: string;
	date: string;
	startTime: string;
	/** Effective length: the per-instance override when one is set, else the
	 *  block's own duration. */
	durationMinutes: number;
	/** The override on its own, so an editor can show "unset" as empty. */
	durationOverride: number | null;
	status: Status;
	completedAt: string | null;
	notes: string;
	mode: 'category' | 'activity';
	label: string;
	/** A name for this occurrence alone, when it differs from the block's. */
	labelOverride: string | null;
	/** Best available name: this occurrence's own label, then the block's, then
	 *  the activity, then the category. */
	title: string;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	/** The activity in effect: a per-instance override if one was picked, else
	 *  whatever the block itself names. */
	activityId: number | null;
	activityName: string | null;
	activityColor: string | null;
	/** What the block names, before any per-instance override — needed to tell
	 *  "this slot is for gym" from "I swapped today's gym for a run". */
	blockActivityId: number | null;
	blockActivityName: string | null;
	resolvedActivityId: number | null;
	/** True when the block still names only a category and no activity was picked. */
	needsResolution: boolean;
	/** Effective ratings: a per-occurrence override where one is set, else the
	 *  block's own. */
	ratings: RatingValues;
	meta: string;
};

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DDTHH:MM:SS' in local time. Defined here rather than imported from
 * week-generator, which imports this module. */
function localISO(d: Date): string {
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
		`T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function atLocal(date: string, startTime: string): string {
	return `${date}T${startTime}:00`;
}

function addDays(d: Date, n: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + n);
	return out;
}

/**
 * Create any missing instances for the window, for both kinds of block.
 *
 * Idempotent: an occurrence that already exists is left exactly as it is, so
 * this can run on every page load without disturbing recorded status. `from` is
 * inclusive, `to` exclusive.
 */
/**
 * The reminder a block asked for, for the occurrence just made.
 *
 * The lead lives on the block — "tell me ten minutes before gym" is said once,
 * about the thing being planned — and each occurrence gets a row here as it
 * appears. Which means a reminder exists only for occurrences that exist, and
 * changing the lead on the block changes it for everything generated after.
 *
 * Quiet about failure on purpose: a reminder that could not be written must not
 * stop the occurrence being written. The plan is the thing; the nudge is not.
 */
function remindFor(
	ctx: Ctx,
	recordId: number,
	scheduledAt: string,
	lead: number | null | undefined
): void {
	if (lead === null || lead === undefined || !Number.isFinite(lead) || lead < 0) return;

	try {
		createReminder(ctx, { subjectId: recordId, at: lead });
	} catch {
		// A malformed time, or a block whose start could not be parsed. The
		// occurrence stands.
	}
}

export function generateInstances(ctx: Ctx, from: Date, to: Date): number {
	const fromDate = formatDate(from);
	const toDate = formatDate(to);
	const fromStr = localISO(new Date(from.getFullYear(), from.getMonth(), from.getDate()));
	const toStr = localISO(new Date(to.getFullYear(), to.getMonth(), to.getDate()));

	let created = 0;

	const slots = db
		.select()
		.from(recurringTasks)
		.where(and(eq(recurringTasks.userId, ctx.userId), eq(recurringTasks.active, true)))
		.all();

	const suppressed = new Set(
		db
			.select()
			.from(suppressedSlots)
			.where(
				and(
					eq(suppressedSlots.userId, ctx.userId),
					gte(suppressedSlots.date, fromDate),
					lt(suppressedSlots.date, toDate)
				)
			)
			.all()
			.map((s) => `${s.slotId}:${s.date}`)
	);

	const existingWeekly = new Set(
		db
			.select({ slotId: taskRecords.slotId, scheduledAt: taskRecords.scheduledAt })
			.from(taskRecords)
			.where(
				and(
					eq(taskRecords.userId, ctx.userId),
					gte(taskRecords.scheduledAt, fromStr),
					lt(taskRecords.scheduledAt, toStr)
				)
			)
			.all()
			.filter((r) => r.slotId !== null)
			.map((r) => `${r.slotId}:${r.scheduledAt.slice(0, 10)}`)
	);

	for (let day = new Date(from); day < to; day = addDays(day, 1)) {
		const dateStr = formatDate(day);

		for (const slot of slots) {
			// The weekday check moved into the rule: an every-3-days slot lands on
			// whatever weekday it lands on.
			if (!occursOn(parseRecurrence(slot.recurrence), day, slot.weekday)) continue;
			if (suppressed.has(`${slot.id}:${dateStr}`)) continue;
			if (existingWeekly.has(`${slot.id}:${dateStr}`)) continue;

			const record = db
				.insert(taskRecords)
				.values({
					...createdStamp(ctx),
					userId: ctx.userId,
					slotId: slot.id,
					scheduledAt: atLocal(dateStr, slot.startTime),
					status: 'todo',
					resolvedActivityId: slot.mode === 'activity' ? slot.activityId : null
				})
				.returning({ id: taskRecords.id })
				.get();

			remindFor(ctx, record.id, atLocal(dateStr, slot.startTime), slot.remindLeadMinutes);
			created++;
		}
	}

	// A one-off produces exactly one instance, guaranteed by a unique index on
	// exceptional_slot_id rather than by hoping every caller checks first.
	const oneOffs = db
		.select()
		.from(exceptionalTasks)
		.where(
			and(
				eq(exceptionalTasks.userId, ctx.userId),
				eq(exceptionalTasks.active, true),
				gte(exceptionalTasks.date, fromDate),
				lt(exceptionalTasks.date, toDate)
			)
		)
		.all();

	for (const one of oneOffs) {
		const existing = db
			.select({ id: taskRecords.id })
			.from(taskRecords)
			.where(eq(taskRecords.exceptionalSlotId, one.id))
			.get();
		if (existing) continue;

		const record = db
			.insert(taskRecords)
			.values({
				...createdStamp(ctx),
				userId: ctx.userId,
				exceptionalSlotId: one.id,
				scheduledAt: atLocal(one.date, one.startTime),
				status: 'todo',
				resolvedActivityId: one.mode === 'activity' ? one.activityId : null
			})
			.returning({ id: taskRecords.id })
			.get();

		remindFor(ctx, record.id, atLocal(one.date, one.startTime), one.remindLeadMinutes);
		created++;
	}

	return created;
}

/** Generate for a whole day, the common case for a page that shows "today". */
export function generateForDate(ctx: Ctx, date: Date): number {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return generateInstances(ctx, start, addDays(start, 1));
}

/**
 * Every occurrence in the window, ordered by time. `from` inclusive, `to`
 * exclusive, both dates rather than datetimes.
 */
export function listInstances(ctx: Ctx, from: Date, to: Date): Occurrence[] {
	const fromStr = localISO(new Date(from.getFullYear(), from.getMonth(), from.getDate()));
	const toStr = localISO(new Date(to.getFullYear(), to.getMonth(), to.getDate()));

	const slotActivities = alias(activities, 'i_slot_activities');
	const oneOffActivities = alias(activities, 'i_oneoff_activities');
	const resolvedActivities = alias(activities, 'i_resolved_activities');
	const slotCategories = alias(categories, 'i_slot_categories');
	const oneOffCategories = alias(categories, 'i_oneoff_categories');
	const slotActivityCategories = alias(categories, 'i_slot_activity_categories');
	const oneOffActivityCategories = alias(categories, 'i_oneoff_activity_categories');

	const rows = db
		.select({
			id: taskRecords.id,
			slotId: taskRecords.slotId,
			exceptionalSlotId: taskRecords.exceptionalSlotId,
			scheduledAt: taskRecords.scheduledAt,
			status: taskRecords.status,
			completedAt: taskRecords.completedAt,
			notes: taskRecords.notes,
			labelOverride: taskRecords.labelOverride,
			durationOverride: taskRecords.durationOverride,
			urgencyOverride: taskRecords.urgencyOverride,
			interestOverride: taskRecords.interestOverride,
			energyOverride: taskRecords.energyOverride,
			resolvedActivityId: taskRecords.resolvedActivityId,
			resolvedActivityName: resolvedActivities.name,
			resolvedActivityColor: resolvedActivities.color,

			slotMode: recurringTasks.mode,
			slotStartTime: recurringTasks.startTime,
			slotDuration: recurringTasks.durationMinutes,
			slotLabel: recurringTasks.label,
			slotMeta: recurringTasks.meta,
			slotCategoryId: recurringTasks.categoryId,
			slotCategoryName: slotCategories.name,
			slotCategoryColor: slotCategories.color,
			slotUrgency: recurringTasks.urgency,
			slotInterest: recurringTasks.interest,
			slotEnergy: recurringTasks.energy,
			slotActivityId: recurringTasks.activityId,
			slotActivityName: slotActivities.name,
			slotActivityColor: slotActivities.color,
			slotActivityCategoryId: slotActivities.categoryId,
			slotActivityCategoryName: slotActivityCategories.name,
			slotActivityCategoryColor: slotActivityCategories.color,

			oneOffMode: exceptionalTasks.mode,
			oneOffStartTime: exceptionalTasks.startTime,
			oneOffDuration: exceptionalTasks.durationMinutes,
			oneOffLabel: exceptionalTasks.label,
			oneOffMeta: exceptionalTasks.meta,
			oneOffCategoryId: exceptionalTasks.categoryId,
			oneOffCategoryName: oneOffCategories.name,
			oneOffCategoryColor: oneOffCategories.color,
			oneOffUrgency: exceptionalTasks.urgency,
			oneOffInterest: exceptionalTasks.interest,
			oneOffEnergy: exceptionalTasks.energy,
			oneOffActivityId: exceptionalTasks.activityId,
			oneOffActivityName: oneOffActivities.name,
			oneOffActivityColor: oneOffActivities.color,
			oneOffActivityCategoryId: oneOffActivities.categoryId,
			oneOffActivityCategoryName: oneOffActivityCategories.name,
			oneOffActivityCategoryColor: oneOffActivityCategories.color
		})
		.from(taskRecords)
		.leftJoin(recurringTasks, eq(taskRecords.slotId, recurringTasks.id))
		.leftJoin(exceptionalTasks, eq(taskRecords.exceptionalSlotId, exceptionalTasks.id))
		.leftJoin(slotCategories, eq(recurringTasks.categoryId, slotCategories.id))
		.leftJoin(slotActivities, eq(recurringTasks.activityId, slotActivities.id))
		.leftJoin(slotActivityCategories, eq(slotActivities.categoryId, slotActivityCategories.id))
		.leftJoin(oneOffCategories, eq(exceptionalTasks.categoryId, oneOffCategories.id))
		.leftJoin(oneOffActivities, eq(exceptionalTasks.activityId, oneOffActivities.id))
		.leftJoin(
			oneOffActivityCategories,
			eq(oneOffActivities.categoryId, oneOffActivityCategories.id)
		)
		.leftJoin(resolvedActivities, eq(taskRecords.resolvedActivityId, resolvedActivities.id))
		.where(
			and(
				eq(taskRecords.userId, ctx.userId),
				gte(taskRecords.scheduledAt, fromStr),
				lt(taskRecords.scheduledAt, toStr)
			)
		)
		.orderBy(asc(taskRecords.scheduledAt))
		.all();

	return rows.map((r): Occurrence => {
		const weekly = r.slotId !== null;

		const mode = (weekly ? r.slotMode : r.oneOffMode) ?? 'activity';
		const label = (weekly ? r.slotLabel : r.oneOffLabel) ?? '';
		const duration = (weekly ? r.slotDuration : r.oneOffDuration) ?? 60;
		const startTime = (weekly ? r.slotStartTime : r.oneOffStartTime) ?? r.scheduledAt.slice(11, 16);

		// A block names either a category or an activity; when it names an
		// activity the category comes along with it.
		const categoryId = weekly
			? (r.slotCategoryId ?? r.slotActivityCategoryId)
			: (r.oneOffCategoryId ?? r.oneOffActivityCategoryId);
		const categoryName = weekly
			? (r.slotCategoryName ?? r.slotActivityCategoryName)
			: (r.oneOffCategoryName ?? r.oneOffActivityCategoryName);
		const categoryColor = weekly
			? (r.slotCategoryColor ?? r.slotActivityCategoryColor)
			: (r.oneOffCategoryColor ?? r.oneOffActivityCategoryColor);

		// A per-instance override wins over whatever the block names.
		const blockActivityId = weekly ? r.slotActivityId : r.oneOffActivityId;
		const blockActivityName = weekly ? r.slotActivityName : r.oneOffActivityName;
		const activityId = r.resolvedActivityId ?? blockActivityId;
		const activityName = r.resolvedActivityName ?? blockActivityName;
		const activityColor =
			r.resolvedActivityColor ?? (weekly ? r.slotActivityColor : r.oneOffActivityColor);

		return {
			id: r.id,
			kind: weekly ? 'weekly' : 'once',
			slotId: r.slotId,
			exceptionalSlotId: r.exceptionalSlotId,
			scheduledAt: r.scheduledAt,
			date: r.scheduledAt.slice(0, 10),
			startTime,
			durationMinutes: r.durationOverride ?? duration,
			durationOverride: r.durationOverride,
			status: r.status,
			completedAt: r.completedAt,
			notes: r.notes ?? '',
			mode,
			label,
			labelOverride: r.labelOverride,
			title: r.labelOverride?.trim() || label.trim() || activityName || categoryName || 'Untitled',
			categoryId: categoryId ?? null,
			categoryName: categoryName ?? null,
			categoryColor: categoryColor ?? null,
			activityId: activityId ?? null,
			activityName: activityName ?? null,
			activityColor: activityColor || null,
			blockActivityId: blockActivityId ?? null,
			blockActivityName: blockActivityName ?? null,
			resolvedActivityId: r.resolvedActivityId ?? null,
			needsResolution: mode === 'category' && activityId == null,
			ratings: {
				urgency: r.urgencyOverride ?? (weekly ? r.slotUrgency : r.oneOffUrgency) ?? null,
				interest: r.interestOverride ?? (weekly ? r.slotInterest : r.oneOffInterest) ?? null,
				energy: r.energyOverride ?? (weekly ? r.slotEnergy : r.oneOffEnergy) ?? null
			},
			meta: (weekly ? r.slotMeta : r.oneOffMeta) ?? '{}'
		};
	});
}

/** Everything on one date. */
export function listForDate(ctx: Ctx, date: Date): Occurrence[] {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return listInstances(ctx, start, addDays(start, 1));
}

// --- Mutations ----------------------------------------------------------------

export const MAX_LABEL_LENGTH = 300;

/**
 * Move an occurrence between statuses.
 *
 * Resetting or skipping a category-mode task also forgets which activity it
 * turned out to be, since that answer belonged to the attempt.
 */
/**
 * The occurrence's record id, whichever shape of id the caller holds.
 *
 * A `slot:N` id already IS a record id; an `exceptional:N` id names the
 * one-off, whose record may not exist until its day is first looked at — so
 * the day is generated the way opening the board does it, then the one record
 * is read. Reminders hang off records, which is why this exists apart from
 * `setOccurrenceStatus`.
 */
export function recordIdOf(ctx: Ctx, occurrenceId: unknown): number {
	const raw = String(occurrenceId ?? '').trim();
	const [kind, rest] = raw.includes(':') ? raw.split(':', 2) : ['slot', raw];
	const id = Number(rest);

	if (!Number.isInteger(id) || id < 1)
		throw new ValidationError(`"${raw}" is not a block id — use the id the day gives you.`);

	if (kind === 'slot') return id;
	if (kind !== 'exceptional')
		throw new ValidationError(`"${raw}" is not a block id — use the id the day gives you.`);

	const one = db
		.select({ date: exceptionalTasks.date })
		.from(exceptionalTasks)
		.where(and(eq(exceptionalTasks.id, id), eq(exceptionalTasks.userId, ctx.userId)))
		.get();
	if (!one) throw new NotFoundError('task');

	// The record for that day, made if this is the first thing to ask for it.
	generateForDate(ctx, new Date(`${one.date}T12:00:00`));

	const record = db
		.select({ id: taskRecords.id })
		.from(taskRecords)
		.where(and(eq(taskRecords.exceptionalSlotId, id), eq(taskRecords.userId, ctx.userId)))
		.get();
	if (!record) throw new NotFoundError('task');

	return record.id;
}

export function setOccurrenceStatus(ctx: Ctx, occurrenceId: unknown, rawStatus: unknown): void {
	setInstanceStatus(ctx, recordIdOf(ctx, occurrenceId), rawStatus);
}

/**
 * Tick a block off — or back on — straight from the plan.
 *
 * The plan knows a block and a date, not an occurrence id: the occurrence may
 * not exist yet, because records are made when a day is first looked at. So
 * the day is generated first, the way opening the board does it, and then the
 * one record for that block on that date is moved.
 */
export function setStatusOn(
	ctx: Ctx,
	kind: 'slot' | 'exceptional',
	refId: number,
	dateStr: string,
	rawStatus: unknown
): void {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new ValidationError('Invalid date');
	if (!Number.isInteger(refId) || refId < 1) throw new ValidationError('Invalid block');

	// The one-off carries its own date, and the id resolver already exists.
	if (kind === 'exceptional') return setOccurrenceStatus(ctx, `exceptional:${refId}`, rawStatus);

	generateForDate(ctx, new Date(`${dateStr}T12:00:00`));

	const record = db
		.select({ id: taskRecords.id })
		.from(taskRecords)
		.where(
			and(
				eq(taskRecords.userId, ctx.userId),
				eq(taskRecords.slotId, refId),
				gte(taskRecords.scheduledAt, `${dateStr}T00:00`),
				lt(taskRecords.scheduledAt, `${dateStr}T24`)
			)
		)
		.get();
	// A skipped-on-that-day block has no record and nothing to tick.
	if (!record) throw new NotFoundError('task');

	setInstanceStatus(ctx, record.id, rawStatus);
}

export function setInstanceStatus(ctx: Ctx, id: number, rawStatus: unknown): void {
	if (!isStatus(rawStatus)) throw new ValidationError('Invalid status');
	const status = rawStatus;

	const instance = db
		.select({
			scheduledAt: taskRecords.scheduledAt,
			slotMode: recurringTasks.mode,
			oneOffMode: exceptionalTasks.mode
		})
		.from(taskRecords)
		.leftJoin(recurringTasks, eq(taskRecords.slotId, recurringTasks.id))
		.leftJoin(exceptionalTasks, eq(taskRecords.exceptionalSlotId, exceptionalTasks.id))
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.get();

	if (!instance) throw new NotFoundError('task');

	const completedAt = status === 'done' ? stamp(ctx) : null;

	const values: Record<string, unknown> = { status, completedAt };
	const mode = instance.slotMode ?? instance.oneOffMode;
	if ((status === 'todo' || status === 'skipped') && mode === 'category')
		values.resolvedActivityId = null;

	db.update(taskRecords)
		.set(values)
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();
}

/**
 * Name this one occurrence.
 *
 * A recurring block says what you usually do; this says what you are doing
 * today. Empty clears it and the block's own label comes back, so there is no
 * separate "reset".
 */
export function setInstanceLabel(ctx: Ctx, id: number, label: unknown): void {
	const text = optionalStr(label, 'label', { max: MAX_LABEL_LENGTH });

	const res = db
		.update(taskRecords)
		.set({ labelOverride: text || null })
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

/** Which activity a category-mode block turned out to be. */
export function resolveInstanceActivity(ctx: Ctx, id: number, activityId: unknown): void {
	const resolved = ownedActivity(ctx, activityId);

	const res = db
		.update(taskRecords)
		.set({ resolvedActivityId: resolved })
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

export function setInstanceTime(ctx: Ctx, id: number, rawTime: unknown): void {
	const time = str(rawTime, 'time', { max: 5, pattern: TIME_PATTERN });

	const task = db
		.select({
			scheduledAt: taskRecords.scheduledAt,
			exceptionalSlotId: taskRecords.exceptionalSlotId
		})
		.from(taskRecords)
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.get();

	if (!task) throw new NotFoundError('task');

	db.transaction((tx) => {
		tx.update(taskRecords)
			.set({ scheduledAt: `${task.scheduledAt.slice(0, 10)}T${time}:00` })
			.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
			.run();

		// A one-off block and its instance are one-to-one, and the plan grid draws
		// the block — leaving it behind would put the same task at two times.
		if (task.exceptionalSlotId !== null) {
			tx.update(exceptionalTasks)
				.set({ startTime: time })
				.where(
					and(
						eq(exceptionalTasks.id, task.exceptionalSlotId),
						eq(exceptionalTasks.userId, ctx.userId)
					)
				)
				.run();
		}
	});
}

/** Zero means "however long the block says"; anything else overrides it. */
export function setInstanceDuration(ctx: Ctx, id: number, minutes: unknown): void {
	const value = num(minutes, 'duration', { int: true, min: 0, max: 24 * 60 });

	const res = db
		.update(taskRecords)
		.set({ durationOverride: value === 0 ? null : value })
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

export function deleteInstance(ctx: Ctx, id: number): void {
	const res = db
		.delete(taskRecords)
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

function ownedActivity(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'activity', { int: true, min: 1 });
	const owned = db
		.select({ id: activities.id })
		.from(activities)
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('activity');
	return id;
}

/**
 * Per-day rating overrides.
 *
 * On an occurrence these leave the block that produced it — and every other day
 * it produces — untouched.
 */
export function setInstanceRatings(
	ctx: Ctx,
	id: number,
	ratings: { urgency?: number | null; interest?: number | null; energy?: number | null }
): void {
	if (Object.keys(ratings).length === 0) return;

	const res = db
		.update(taskRecords)
		.set({
			urgencyOverride: ratings.urgency,
			interestOverride: ratings.interest,
			energyOverride: ratings.energy
		})
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

/**
 * Change one block on one day, by the id the schedule hands out.
 *
 * ## Why this exists
 *
 * An assistant asked to "push the study block to four" had no way to do it —
 * the tools were add, and answer for. So it invented one: it added a second
 * block at the new time and marked the original **skipped** to clear it off the
 * grid. The day then said something that had not happened. A skip is a fact
 * about a week — it feeds the review's "what did not happen" and the history —
 * and using it as a tidy-up writes a small lie into somebody's record of their
 * own life.
 *
 * The verb existed everywhere in the app and nowhere in the API. This is it,
 * once, for both kinds of block, taking whichever fields are actually changing.
 *
 * ## One day, never the pattern
 *
 * Moving *this* Thursday's gym does not move gym. A recurring block's
 * occurrence is changed on its own record — the same thing dragging it in the
 * grid does — and a move to another day becomes what it already is in this
 * app: that day suppressed, and a one-off carrying the same identity at the new
 * time. Nothing here edits the weekly plan, because "push it to four" never
 * means "and every Thursday from now on".
 */
export function changeOccurrence(
	ctx: Ctx,
	occurrenceId: unknown,
	changes: {
		date?: unknown;
		startTime?: unknown;
		minutes?: unknown;
		title?: unknown;
		/** Already resolved to an owned category — the caller's job to look up. */
		categoryId?: number;
	}
): { id: string } {
	const { kind, id } = parseOccurrenceId(occurrenceId);

	const wants = (key: keyof typeof changes) =>
		changes[key] !== undefined && changes[key] !== null && changes[key] !== '';

	if (
		!wants('date') &&
		!wants('startTime') &&
		!wants('minutes') &&
		!wants('title') &&
		!wants('categoryId')
	) {
		throw new ValidationError(
			'Nothing to change — say a new time, day, length, title or category.'
		);
	}

	if (kind === 'exceptional') {
		const one = db
			.select()
			.from(exceptionalTasks)
			.where(and(eq(exceptionalTasks.id, id), eq(exceptionalTasks.userId, ctx.userId)))
			.get();
		if (!one) throw new NotFoundError('block');

		// Everything not being changed is passed back as it was: `updateExceptional`
		// writes the whole placement, so a partial call would blank the rest.
		// Refiling wins over renaming's bookkeeping: a block moved to another
		// category stops being the named activity it was, exactly as a rename
		// does, because the activity carried the old category.
		const kept = renamed(ctx, wants('title'), {
			mode: one.mode,
			activityId: one.activityId,
			categoryId: one.categoryId
		});
		const filed = wants('categoryId')
			? { mode: 'category', activityId: null, categoryId: changes.categoryId! }
			: kept;

		updateExceptional(ctx, id, {
			date: wants('date') ? changes.date : one.date,
			startTime: wants('startTime') ? changes.startTime : one.startTime,
			durationMinutes: wants('minutes') ? changes.minutes : one.durationMinutes,
			...filed,
			label: wants('title') ? changes.title : one.label
		});

		return { id: `exceptional:${id}` };
	}

	/*
	 * The block's length, and where it has to come from.
	 *
	 * `durationOverride` is null unless that particular day was resized, so
	 * reading only the record and falling back to nothing let `moveOccurrence`
	 * use its own default of an hour — and a ninety-minute study block came out
	 * the other side of a move as sixty. The override when there is one, the
	 * block's own length when there is not.
	 */
	const record = db
		.select({
			id: taskRecords.id,
			slotId: taskRecords.slotId,
			scheduledAt: taskRecords.scheduledAt,
			durationOverride: taskRecords.durationOverride,
			slotDuration: recurringTasks.durationMinutes
		})
		.from(taskRecords)
		.leftJoin(recurringTasks, eq(taskRecords.slotId, recurringTasks.id))
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.get();
	if (!record) throw new NotFoundError('block');

	const onDate = record.scheduledAt.slice(0, 10);
	const toDate = wants('date') ? str(changes.date, 'date', { max: 10 }) : onDate;

	/*
	 * It becomes a one-off, whether or not the day changes.
	 *
	 * The same thing alt-dragging it in the grid does — and it has to be, because
	 * a recurring occurrence's time and title are read off the *block*, not off
	 * the record: writing an override onto the record moves it nowhere anybody
	 * can see. So the occurrence is suppressed on its date and a one-off
	 * carrying the same identity is created at the new time.
	 *
	 * `suppressed` is not `skipped`. One says "not this week", which is what
	 * moving something means; the other says "I did not do it", which the
	 * weekly review asks about. Only the second is a fact about a person.
	 */
	if (!record.slotId) throw new ValidationError('That block has nothing to move.');

	const movedId = moveOccurrence(ctx, {
		slotId: record.slotId,
		fromDate: onDate,
		date: toDate,
		startTime: wants('startTime') ? changes.startTime : record.scheduledAt.slice(11, 16),
		durationMinutes: wants('minutes')
			? changes.minutes
			: (record.durationOverride ?? record.slotDuration ?? undefined)
	});

	// The title, on the one-off it just became.
	if (wants('title')) {
		const moved = db
			.select()
			.from(exceptionalTasks)
			.where(and(eq(exceptionalTasks.id, movedId), eq(exceptionalTasks.userId, ctx.userId)))
			.get();
		if (moved) {
			updateExceptional(ctx, movedId, {
				date: moved.date,
				startTime: moved.startTime,
				durationMinutes: moved.durationMinutes,
				...renamed(ctx, true, {
					mode: moved.mode,
					activityId: moved.activityId,
					categoryId: moved.categoryId
				}),
				label: changes.title
			});
		}
	}

	if (wants('categoryId')) {
		const made = db
			.select()
			.from(exceptionalTasks)
			.where(and(eq(exceptionalTasks.id, movedId), eq(exceptionalTasks.userId, ctx.userId)))
			.get();
		if (made) {
			updateExceptional(ctx, movedId, {
				date: made.date,
				startTime: made.startTime,
				durationMinutes: made.durationMinutes,
				mode: 'category',
				activityId: null,
				categoryId: changes.categoryId!,
				label: made.label
			});
		}
	}

	return { id: `exceptional:${movedId}` };
}

/**
 * What a rename does to a block that was named by an activity.
 *
 * A block gets its name from its activity when it has one, and from its label
 * otherwise — so setting a label on a block called "deep work" changes nothing
 * anybody can see. Asked to "put down that I was actually working on
 * Ontoplano", that reads as the tool silently doing nothing.
 *
 * So a rename detaches the activity and keeps the category: the hour is still
 * Work, still the same colour, still counted the same way, and it is no longer
 * the deep-work activity — which is exactly what somebody means by saying it
 * was something else. Nothing is dropped when no new name was given.
 */
function renamed(
	ctx: Ctx,
	renaming: boolean,
	current: { mode: string; activityId: number | null; categoryId: number | null }
): { mode: string; activityId: number | null; categoryId: number | null } {
	if (!renaming || !current.activityId) {
		return {
			mode: current.mode,
			activityId: current.activityId,
			categoryId: current.categoryId
		};
	}

	// The category has to come with it. A block that names an activity carries
	// no category of its own — it borrows the activity's — so dropping the
	// activity and keeping `categoryId` as it was leaves a block belonging to
	// nothing, which the service rightly refuses with "Category required". The
	// rename then failed silently through the API: the move went through and the
	// new name did not.
	const activity = db
		.select({ categoryId: activities.categoryId })
		.from(activities)
		.where(and(eq(activities.id, current.activityId), eq(activities.userId, ctx.userId)))
		.get();

	return { mode: 'category', activityId: null, categoryId: activity?.categoryId ?? null };
}

/**
 * Take a block off a day, because it is not happening and never was.
 *
 * The counterpart to `setOccurrenceStatus(…, 'skipped')`, and the distinction is
 * the whole point of having both. **Skipped** is a fact about a week: you meant
 * to do it and did not, and the review asks about it. **Cancelled** is the plan
 * being wrong: the meeting moved, the lesson was called off, it was put on the
 * wrong day. One belongs in the record and one does not, and an assistant with
 * only the first will use it for the second — which is exactly what happened.
 *
 * A one-off is deleted. An occurrence of a recurring block is suppressed for
 * that date only, which is reversible in the app and leaves the pattern alone.
 */
export function cancelOccurrence(ctx: Ctx, occurrenceId: unknown): { ok: true } {
	const { kind, id } = parseOccurrenceId(occurrenceId);

	if (kind === 'exceptional') {
		deleteExceptional(ctx, id);
		return { ok: true };
	}

	const record = db
		.select({ slotId: taskRecords.slotId, scheduledAt: taskRecords.scheduledAt })
		.from(taskRecords)
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.get();
	if (!record) throw new NotFoundError('block');

	if (record.slotId) {
		suppressOccurrence(ctx, record.slotId, record.scheduledAt.slice(0, 10));
		// And the record it already produced, which suppression alone does not
		// touch: `generateInstances` skips a suppressed date, but a day that has
		// already been generated keeps its row, and the day would go on listing a
		// block that is no longer on it. `moveOccurrence` deletes it for the same
		// reason.
		deleteInstance(ctx, id);
		return { ok: true };
	}

	deleteInstance(ctx, id);
	return { ok: true };
}

/**
 * `slot:42` or `exceptional:7`, as every id in the schedule is written.
 *
 * Shared by the three things that take one, so the message somebody gets for a
 * malformed id is the same wherever they hit it.
 */
function parseOccurrenceId(value: unknown): { kind: 'slot' | 'exceptional'; id: number } {
	const raw = String(value ?? '').trim();
	const [prefix, rest] = raw.includes(':') ? raw.split(':', 2) : ['slot', raw];
	const id = Number(rest);

	if ((prefix !== 'slot' && prefix !== 'exceptional') || !Number.isInteger(id) || id < 1) {
		throw new ValidationError(`"${raw}" is not a block id — use the id the day gives you.`);
	}

	return { kind: prefix, id };
}
