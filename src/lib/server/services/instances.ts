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
	/** Best available name: explicit label, else the activity, else the category. */
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
export function generateInstances(userId: string, from: Date, to: Date): number {
	const fromDate = formatDate(from);
	const toDate = formatDate(to);
	const fromStr = localISO(new Date(from.getFullYear(), from.getMonth(), from.getDate()));
	const toStr = localISO(new Date(to.getFullYear(), to.getMonth(), to.getDate()));

	let created = 0;

	const slots = db
		.select()
		.from(weeklySlots)
		.where(and(eq(weeklySlots.userId, userId), eq(weeklySlots.active, true)))
		.all();

	const suppressed = new Set(
		db
			.select()
			.from(suppressedSlots)
			.where(
				and(
					eq(suppressedSlots.userId, userId),
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
					eq(taskInstances.userId, userId),
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
		// weeklySlots.weekday is Monday-indexed; Date.getDay() is Sunday-indexed.
		const weekday = (day.getDay() + 6) % 7;

		for (const slot of slots) {
			if (slot.weekday !== weekday) continue;
			if (suppressed.has(`${slot.id}:${dateStr}`)) continue;
			if (existingWeekly.has(`${slot.id}:${dateStr}`)) continue;

			db.insert(taskInstances)
				.values({
					userId,
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
				eq(exceptionalSlots.userId, userId),
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
				userId,
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
export function generateForDate(userId: string, date: Date): number {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return generateInstances(userId, start, addDays(start, 1));
}

/**
 * Every occurrence in the window, ordered by time. `from` inclusive, `to`
 * exclusive, both dates rather than datetimes.
 */
export function listInstances(userId: string, from: Date, to: Date): Occurrence[] {
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
				eq(taskInstances.userId, userId),
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
			title: label.trim() || activityName || categoryName || 'Untitled',
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
export function listForDate(userId: string, date: Date): Occurrence[] {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return listInstances(userId, start, addDays(start, 1));
}
