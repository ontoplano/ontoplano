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
import { isStatus, isTiming, timingFor } from '../../task-status.js';
import type { Ctx } from './ctx.js';
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

import type { Status, Timing } from '../../task-status.js';
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
	timing: Timing | null;
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

			db.insert(taskRecords)
				.values({
					...createdStamp(ctx),
					userId: ctx.userId,
					slotId: slot.id,
					scheduledAt: atLocal(dateStr, slot.startTime),
					status: 'todo',
					resolvedActivityId: slot.mode === 'activity' ? slot.activityId : null
				})
				.run();
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

		db.insert(taskRecords)
			.values({
				...createdStamp(ctx),
				userId: ctx.userId,
				exceptionalSlotId: one.id,
				scheduledAt: atLocal(one.date, one.startTime),
				status: 'todo',
				resolvedActivityId: one.mode === 'activity' ? one.activityId : null
			})
			.run();
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
			timing: taskRecords.timing,
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
			timing: r.timing,
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
 * Timing is derived, not chosen: it is a fact about a finished task, so it only
 * exists once one is done and is cleared whenever it is reopened. Resetting or
 * skipping a category-mode task also forgets which activity it turned out to
 * be, since that answer belonged to the attempt.
 */
/**
 * Say when it actually happened, rather than when the clock says you said so.
 *
 * Marking a day's work done at the end of the day makes everything "late",
 * which is true of the tick and false of the doing. This is the correction, and
 * it is one click on the badge rather than an edit form.
 */
export function setInstanceTiming(ctx: Ctx, id: number, raw: unknown): void {
	const timing = raw === '' || raw === null || raw === undefined ? null : raw;
	if (timing !== null && !isTiming(timing)) throw new ValidationError('Unknown timing');

	const res = db
		.update(taskRecords)
		.set({ timing })
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
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
	const timing = completedAt ? timingFor(instance.scheduledAt, completedAt) : null;

	const values: Record<string, unknown> = { status, completedAt, timing };
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
