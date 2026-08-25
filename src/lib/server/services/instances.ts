/**
 * The one answer to "what is on, between these dates".
 *
 * Both kinds of planned block — a recurring weekly slot and a one-off — produce
 * rows in `task_instances`, and this module is the only place that knows how to
 * generate and read them. Before it existed each caller wrote its own union of
 * two tables, and the ones that forgot the second half were quietly wrong: the
 * dashboard omitted one-offs entirely and the tracker's day tabs counted a
 * different set of tasks than the list beneath them displayed.
 */
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { db } from '../db/index.js';
import { isStatus, timingFor } from '../../task-status.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
// `created` is also a local counter in this file, hence the alias.
import { created as createdStamp, stamp } from './time.js';
import { num, optionalStr, str } from './validate.js';
import {
	activities,
	categories,
	exceptionalSlots,
	suppressedSlots,
	taskInstances,
	weeklySlots
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
		.from(weeklySlots)
		.where(and(eq(weeklySlots.userId, ctx.userId), eq(weeklySlots.active, true)))
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
			.select({ slotId: taskInstances.slotId, scheduledAt: taskInstances.scheduledAt })
			.from(taskInstances)
			.where(
				and(
					eq(taskInstances.userId, ctx.userId),
					gte(taskInstances.scheduledAt, fromStr),
					lt(taskInstances.scheduledAt, toStr)
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

			db.insert(taskInstances)
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
		.from(exceptionalSlots)
		.where(
			and(
				eq(exceptionalSlots.userId, ctx.userId),
				eq(exceptionalSlots.active, true),
				gte(exceptionalSlots.date, fromDate),
				lt(exceptionalSlots.date, toDate)
			)
		)
		.all();

	for (const one of oneOffs) {
		const existing = db
			.select({ id: taskInstances.id })
			.from(taskInstances)
			.where(eq(taskInstances.exceptionalSlotId, one.id))
			.get();
		if (existing) continue;

		db.insert(taskInstances)
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
			id: taskInstances.id,
			slotId: taskInstances.slotId,
			exceptionalSlotId: taskInstances.exceptionalSlotId,
			scheduledAt: taskInstances.scheduledAt,
			status: taskInstances.status,
			timing: taskInstances.timing,
			completedAt: taskInstances.completedAt,
			notes: taskInstances.notes,
			labelOverride: taskInstances.labelOverride,
			durationOverride: taskInstances.durationOverride,
			urgencyOverride: taskInstances.urgencyOverride,
			interestOverride: taskInstances.interestOverride,
			energyOverride: taskInstances.energyOverride,
			resolvedActivityId: taskInstances.resolvedActivityId,
			resolvedActivityName: resolvedActivities.name,
			resolvedActivityColor: resolvedActivities.color,

			slotMode: weeklySlots.mode,
			slotStartTime: weeklySlots.startTime,
			slotDuration: weeklySlots.durationMinutes,
			slotLabel: weeklySlots.label,
			slotMeta: weeklySlots.meta,
			slotCategoryId: weeklySlots.categoryId,
			slotCategoryName: slotCategories.name,
			slotCategoryColor: slotCategories.color,
			slotUrgency: weeklySlots.urgency,
			slotInterest: weeklySlots.interest,
			slotEnergy: weeklySlots.energy,
			slotActivityId: weeklySlots.activityId,
			slotActivityName: slotActivities.name,
			slotActivityColor: slotActivities.color,
			slotActivityCategoryId: slotActivities.categoryId,
			slotActivityCategoryName: slotActivityCategories.name,
			slotActivityCategoryColor: slotActivityCategories.color,

			oneOffMode: exceptionalSlots.mode,
			oneOffStartTime: exceptionalSlots.startTime,
			oneOffDuration: exceptionalSlots.durationMinutes,
			oneOffLabel: exceptionalSlots.label,
			oneOffMeta: exceptionalSlots.meta,
			oneOffCategoryId: exceptionalSlots.categoryId,
			oneOffCategoryName: oneOffCategories.name,
			oneOffCategoryColor: oneOffCategories.color,
			oneOffUrgency: exceptionalSlots.urgency,
			oneOffInterest: exceptionalSlots.interest,
			oneOffEnergy: exceptionalSlots.energy,
			oneOffActivityId: exceptionalSlots.activityId,
			oneOffActivityName: oneOffActivities.name,
			oneOffActivityColor: oneOffActivities.color,
			oneOffActivityCategoryId: oneOffActivities.categoryId,
			oneOffActivityCategoryName: oneOffActivityCategories.name,
			oneOffActivityCategoryColor: oneOffActivityCategories.color
		})
		.from(taskInstances)
		.leftJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(exceptionalSlots, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
		.leftJoin(slotCategories, eq(weeklySlots.categoryId, slotCategories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(slotActivityCategories, eq(slotActivities.categoryId, slotActivityCategories.id))
		.leftJoin(oneOffCategories, eq(exceptionalSlots.categoryId, oneOffCategories.id))
		.leftJoin(oneOffActivities, eq(exceptionalSlots.activityId, oneOffActivities.id))
		.leftJoin(
			oneOffActivityCategories,
			eq(oneOffActivities.categoryId, oneOffActivityCategories.id)
		)
		.leftJoin(resolvedActivities, eq(taskInstances.resolvedActivityId, resolvedActivities.id))
		.where(
			and(
				eq(taskInstances.userId, ctx.userId),
				gte(taskInstances.scheduledAt, fromStr),
				lt(taskInstances.scheduledAt, toStr)
			)
		)
		.orderBy(asc(taskInstances.scheduledAt))
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

const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * Move an occurrence between statuses.
 *
 * Timing is derived, not chosen: it is a fact about a finished task, so it only
 * exists once one is done and is cleared whenever it is reopened. Resetting or
 * skipping a category-mode task also forgets which activity it turned out to
 * be, since that answer belonged to the attempt.
 */
export function setInstanceStatus(ctx: Ctx, id: number, rawStatus: unknown): void {
	if (!isStatus(rawStatus)) throw new ValidationError('Invalid status');
	const status = rawStatus;

	const instance = db
		.select({
			scheduledAt: taskInstances.scheduledAt,
			slotMode: weeklySlots.mode,
			oneOffMode: exceptionalSlots.mode
		})
		.from(taskInstances)
		.leftJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(exceptionalSlots, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
		.get();

	if (!instance) throw new NotFoundError('task');

	const completedAt = status === 'done' ? stamp(ctx) : null;
	const timing = completedAt ? timingFor(instance.scheduledAt, completedAt) : null;

	const values: Record<string, unknown> = { status, completedAt, timing };
	const mode = instance.slotMode ?? instance.oneOffMode;
	if ((status === 'todo' || status === 'skipped') && mode === 'category')
		values.resolvedActivityId = null;

	db.update(taskInstances)
		.set(values)
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
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
		.update(taskInstances)
		.set({ labelOverride: text || null })
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

/** Which activity a category-mode block turned out to be. */
export function resolveInstanceActivity(ctx: Ctx, id: number, activityId: unknown): void {
	const resolved = ownedActivity(ctx, activityId);

	const res = db
		.update(taskInstances)
		.set({ resolvedActivityId: resolved })
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

export function setInstanceTime(ctx: Ctx, id: number, rawTime: unknown): void {
	const time = str(rawTime, 'time', { max: 5, pattern: TIME_PATTERN });

	const task = db
		.select({
			scheduledAt: taskInstances.scheduledAt,
			exceptionalSlotId: taskInstances.exceptionalSlotId
		})
		.from(taskInstances)
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
		.get();

	if (!task) throw new NotFoundError('task');

	db.transaction((tx) => {
		tx.update(taskInstances)
			.set({ scheduledAt: `${task.scheduledAt.slice(0, 10)}T${time}:00` })
			.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
			.run();

		// A one-off block and its instance are one-to-one, and the plan grid draws
		// the block — leaving it behind would put the same task at two times.
		if (task.exceptionalSlotId !== null) {
			tx.update(exceptionalSlots)
				.set({ startTime: time })
				.where(
					and(
						eq(exceptionalSlots.id, task.exceptionalSlotId),
						eq(exceptionalSlots.userId, ctx.userId)
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
		.update(taskInstances)
		.set({ durationOverride: value === 0 ? null : value })
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}

export function deleteInstance(ctx: Ctx, id: number): void {
	const res = db
		.delete(taskInstances)
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
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
		.update(taskInstances)
		.set({
			urgencyOverride: ratings.urgency,
			interestOverride: ratings.interest,
			energyOverride: ratings.energy
		})
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('task');
}
