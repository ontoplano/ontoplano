/**
 * Goals, and the progress that makes them more than a wish list.
 *
 * A goal linked to tasks has progress that can be counted: how many of the
 * occurrences it covers actually got done inside its period. That is the whole
 * point of linking — a self-reported number tells you what you believe, and the
 * execution log tells you what happened.
 */
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
	activities,
	goalAreas,
	goalLinks,
	goals,
	plannerTodos,
	taskInstances,
	weeklySlots
} from '../db/schema.js';
import { periodEnd, periodStart, isGoalStatus, isHorizon, type Horizon } from '../../goals.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { created, stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';

export type GoalArea = { id: number; name: string; color: string; sortOrder: number };

export type GoalProgress = {
	/** Occurrences of linked tasks inside the period. Null when nothing is linked. */
	total: number | null;
	done: number | null;
	/** 0-1, from counted tasks when linked, else from target/current. */
	fraction: number | null;
};

export type Goal = {
	id: number;
	areaId: number | null;
	areaName: string | null;
	areaColor: string | null;
	parentId: number | null;
	title: string;
	notes: string;
	horizon: Horizon;
	periodStart: string;
	targetValue: number | null;
	currentValue: number;
	unit: string;
	status: 'open' | 'achieved' | 'missed' | 'abandoned';
	outcome: string;
	closedAt: string | null;
	linkedSlotIds: number[];
	linkedTodoIds: number[];
	linkedActivityIds: number[];
	progress: GoalProgress;
};

export function listAreas(ctx: Ctx): GoalArea[] {
	return db
		.select({
			id: goalAreas.id,
			name: goalAreas.name,
			color: goalAreas.color,
			sortOrder: goalAreas.sortOrder
		})
		.from(goalAreas)
		.where(eq(goalAreas.userId, ctx.userId))
		.orderBy(asc(goalAreas.sortOrder), asc(goalAreas.name))
		.all();
}

/**
 * Counted progress for one goal.
 *
 * Linked weekly slots contribute every occurrence they produced inside the
 * period; linked activities contribute any occurrence resolved to them, which
 * is how "do more of X" works without naming a particular slot. Todos count
 * once each.
 */
function progressFor(
	ctx: Ctx,
	goal: { horizon: Horizon; periodStart: string },
	slotIds: number[],
	todoIds: number[],
	activityIds: number[],
	target: number | null,
	current: number
): GoalProgress {
	const linked = slotIds.length + todoIds.length + activityIds.length;
	if (linked === 0) {
		const fraction = target && target > 0 ? Math.min(current / target, 1) : null;
		return { total: null, done: null, fraction };
	}

	const from = goal.periodStart;
	const to = periodEnd(goal.horizon, goal.periodStart);

	let total = 0;
	let done = 0;

	if (slotIds.length > 0 || activityIds.length > 0) {
		const rows = db
			.select({
				status: taskInstances.status,
				slotId: taskInstances.slotId,
				resolvedActivityId: taskInstances.resolvedActivityId
			})
			.from(taskInstances)
			.where(
				and(
					eq(taskInstances.userId, ctx.userId),
					gte(taskInstances.scheduledAt, `${from}T00:00:00`),
					lt(taskInstances.scheduledAt, `${to}T00:00:00`)
				)
			)
			.all();

		for (const r of rows) {
			const bySlot = r.slotId !== null && slotIds.includes(r.slotId);
			const byActivity =
				r.resolvedActivityId !== null && activityIds.includes(r.resolvedActivityId);
			// A slot that is itself linked and resolves to a linked activity is one
			// occurrence, not two.
			if (!bySlot && !byActivity) continue;
			total++;
			if (r.status === 'done') done++;
		}
	}

	if (todoIds.length > 0) {
		const rows = db
			.select({ status: plannerTodos.status })
			.from(plannerTodos)
			.where(and(eq(plannerTodos.userId, ctx.userId), inArray(plannerTodos.id, todoIds)))
			.all();
		total += rows.length;
		done += rows.filter((r) => r.status === 'done').length;
	}

	return { total, done, fraction: total > 0 ? done / total : null };
}

export function listGoals(ctx: Ctx, opts: { includeClosed?: boolean } = {}): Goal[] {
	const rows = db
		.select({
			id: goals.id,
			areaId: goals.areaId,
			areaName: goalAreas.name,
			areaColor: goalAreas.color,
			parentId: goals.parentId,
			title: goals.title,
			notes: goals.notes,
			horizon: goals.horizon,
			periodStart: goals.periodStart,
			targetValue: goals.targetValue,
			currentValue: goals.currentValue,
			unit: goals.unit,
			status: goals.status,
			outcome: goals.outcome,
			closedAt: goals.closedAt
		})
		.from(goals)
		.leftJoin(goalAreas, eq(goals.areaId, goalAreas.id))
		.where(eq(goals.userId, ctx.userId))
		.orderBy(asc(goals.periodStart), asc(goals.title))
		.all();

	const ids = rows.map((r) => r.id);
	const links =
		ids.length > 0 ? db.select().from(goalLinks).where(inArray(goalLinks.goalId, ids)).all() : [];

	return rows
		.filter((r) => opts.includeClosed || r.status === 'open')
		.map((r): Goal => {
			const mine = links.filter((l) => l.goalId === r.id);
			const linkedSlotIds = mine.map((l) => l.slotId).filter((v): v is number => v !== null);
			const linkedTodoIds = mine.map((l) => l.todoId).filter((v): v is number => v !== null);
			const linkedActivityIds = mine
				.map((l) => l.activityId)
				.filter((v): v is number => v !== null);

			return {
				id: r.id,
				areaId: r.areaId,
				areaName: r.areaName,
				areaColor: r.areaColor,
				parentId: r.parentId,
				title: r.title,
				notes: r.notes ?? '',
				horizon: r.horizon,
				periodStart: r.periodStart,
				targetValue: r.targetValue,
				currentValue: r.currentValue,
				unit: r.unit ?? '',
				status: r.status,
				outcome: r.outcome ?? '',
				closedAt: r.closedAt,
				linkedSlotIds,
				linkedTodoIds,
				linkedActivityIds,
				progress: progressFor(
					ctx,
					r,
					linkedSlotIds,
					linkedTodoIds,
					linkedActivityIds,
					r.targetValue,
					r.currentValue
				)
			};
		});
}

/** Goals whose period covers `date`, for the dashboard card. */
export function listActiveOn(ctx: Ctx, date: string): Goal[] {
	return listGoals(ctx).filter(
		(g) => date >= g.periodStart && date < periodEnd(g.horizon, g.periodStart)
	);
}

/** Weekly slots a goal can be linked to, for the picker. */
export function linkableSlots(ctx: Ctx) {
	return db
		.select({
			id: weeklySlots.id,
			label: weeklySlots.label,
			weekday: weeklySlots.weekday,
			startTime: weeklySlots.startTime,
			activityId: weeklySlots.activityId
		})
		.from(weeklySlots)
		.where(and(eq(weeklySlots.userId, ctx.userId), eq(weeklySlots.active, true)))
		.orderBy(asc(weeklySlots.weekday), asc(weeklySlots.startTime))
		.all();
}

// --- Mutations ----------------------------------------------------------------

export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTES_LENGTH = 4000;
export const MAX_UNIT_LENGTH = 40;
export const MAX_OUTCOME_LENGTH = 2000;
export const MAX_AREA_NAME_LENGTH = 100;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createArea(ctx: Ctx, raw: { name: unknown; color?: unknown }): number {
	const name = str(raw.name, 'name', { max: MAX_AREA_NAME_LENGTH });
	const color = parseColor(raw.color) ?? '#6b7280';

	const clash = db
		.select({ id: goalAreas.id })
		.from(goalAreas)
		.where(and(eq(goalAreas.userId, ctx.userId), eq(goalAreas.name, name)))
		.get();

	if (clash) throw new ConflictError('You already have an area with that name');

	const result = db
		.insert(goalAreas)
		.values({
			...created(ctx),
			userId: ctx.userId,
			name,
			color
		})
		.run();
	return Number(result.lastInsertRowid);
}

/** Goals keep existing without an area rather than disappearing with it. */
export function deleteArea(ctx: Ctx, id: number): void {
	const res = db
		.delete(goalAreas)
		.where(and(eq(goalAreas.id, id), eq(goalAreas.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('area');
}

export function createGoal(
	ctx: Ctx,
	raw: {
		title: unknown;
		horizon: unknown;
		notes?: unknown;
		startDate?: unknown;
		areaId?: unknown;
		parentId?: unknown;
		targetValue?: unknown;
		unit?: unknown;
	}
): number {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	const horizon = parseHorizon(raw.horizon);
	const anchor = parseAnchor(raw.startDate) ?? ctx.now;

	const result = db
		.insert(goals)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			title,
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			horizon,
			// Anchored to the period containing the chosen date, so two goals in
			// the same quarter always agree on where that quarter starts.
			periodStart: periodStart(horizon, anchor),
			areaId: ownedAreaId(ctx, raw.areaId),
			parentId: ownedGoalId(ctx, raw.parentId),
			targetValue: parseTarget(raw.targetValue),
			unit: optionalStr(raw.unit, 'unit', { max: MAX_UNIT_LENGTH })
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updateGoal(
	ctx: Ctx,
	id: number,
	raw: {
		title: unknown;
		notes?: unknown;
		areaId?: unknown;
		targetValue?: unknown;
		unit?: unknown;
		horizon?: unknown;
		startDate?: unknown;
	}
): void {
	const current = db
		.select({ horizon: goals.horizon, periodStart: goals.periodStart })
		.from(goals)
		.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
		.get();

	if (!current) throw new NotFoundError('goal');

	// A week goal that turns out to be a month's work should not have to be
	// deleted and retyped. Both the horizon and the date it starts from can move
	// — and either one moving re-aligns the period, since a quarter that began
	// mid-month is not a quarter.
	const horizon =
		raw.horizon === undefined || raw.horizon === null ? current.horizon : parseHorizon(raw.horizon);
	const anchor = parseAnchor(raw.startDate) ?? new Date(`${current.periodStart}T00:00:00`);

	const res = db
		.update(goals)
		.set({
			title: str(raw.title, 'title', { max: MAX_TITLE_LENGTH }),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			areaId: ownedAreaId(ctx, raw.areaId),
			targetValue: parseTarget(raw.targetValue),
			unit: optionalStr(raw.unit, 'unit', { max: MAX_UNIT_LENGTH }),
			horizon,
			periodStart: periodStart(horizon, anchor),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('goal');
}

/** Self-reported progress, for goals with a target and no linked tasks. */
export function setGoalProgress(ctx: Ctx, id: number, value: unknown): void {
	const currentValue = num(value, 'progress', { min: 0 });

	const res = db
		.update(goals)
		.set({ currentValue, updatedAt: stamp(ctx) })
		.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('goal');
}

export function closeGoal(ctx: Ctx, id: number, raw: { status: unknown; outcome?: unknown }): void {
	const status = raw.status;
	if (!isGoalStatus(status)) throw new ValidationError('Invalid status');

	const now = stamp(ctx);
	const res = db
		.update(goals)
		.set({
			status,
			outcome: optionalStr(raw.outcome, 'outcome', { max: MAX_OUTCOME_LENGTH }),
			// Reopening clears the closing date, so a reopened goal does not read
			// as having been finished at some point in the past.
			closedAt: status === 'open' ? null : now,
			updatedAt: now
		})
		.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('goal');
}

/** Replace a goal's links wholesale — simpler than diffing, and idempotent. */
export function setGoalLinks(
	ctx: Ctx,
	id: number,
	links: { slotIds: unknown[]; todoIds: unknown[]; activityIds: unknown[] }
): void {
	assertOwnedGoal(ctx, id);

	const slotIds = ownedIds(links.slotIds, ownedSlotIds(ctx));
	const todoIds = ownedIds(links.todoIds, ownedTodoIds(ctx));
	const activityIds = ownedIds(links.activityIds, ownedActivityIds(ctx));

	db.transaction((tx) => {
		tx.delete(goalLinks).where(eq(goalLinks.goalId, id)).run();
		for (const slotId of slotIds) tx.insert(goalLinks).values({ goalId: id, slotId }).run();
		for (const todoId of todoIds) tx.insert(goalLinks).values({ goalId: id, todoId }).run();
		for (const activityId of activityIds)
			tx.insert(goalLinks).values({ goalId: id, activityId }).run();
	});
}

export function deleteGoal(ctx: Ctx, id: number): void {
	assertOwnedGoal(ctx, id);

	db.transaction((tx) => {
		// Children outlive their parent rather than cascading away; losing a year
		// goal should not silently delete a quarter's worth of work.
		tx.update(goals)
			.set({ parentId: null })
			.where(and(eq(goals.parentId, id), eq(goals.userId, ctx.userId)))
			.run();
		tx.delete(goals)
			.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
			.run();
	});
}

function assertOwnedGoal(ctx: Ctx, id: number): void {
	const owned = db
		.select({ id: goals.id })
		.from(goals)
		.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('goal');
}

function ownedGoalId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'parent goal', { int: true, min: 1 });
	assertOwnedGoal(ctx, id);
	return id;
}

function ownedAreaId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'area', { int: true, min: 1 });
	const owned = db
		.select({ id: goalAreas.id })
		.from(goalAreas)
		.where(and(eq(goalAreas.id, id), eq(goalAreas.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('area');
	return id;
}

/** Link targets are ids from a form; keep only the ones this account owns. */
function ownedIds(claimed: unknown[], owned: number[]): number[] {
	const allowed = new Set(owned);
	return claimed.map(Number).filter((n) => Number.isFinite(n) && allowed.has(n));
}

function ownedSlotIds(ctx: Ctx): number[] {
	return db
		.select({ id: weeklySlots.id })
		.from(weeklySlots)
		.where(eq(weeklySlots.userId, ctx.userId))
		.all()
		.map((r) => r.id);
}

function ownedTodoIds(ctx: Ctx): number[] {
	return db
		.select({ id: plannerTodos.id })
		.from(plannerTodos)
		.where(eq(plannerTodos.userId, ctx.userId))
		.all()
		.map((r) => r.id);
}

function ownedActivityIds(ctx: Ctx): number[] {
	return db
		.select({ id: activities.id })
		.from(activities)
		.where(eq(activities.userId, ctx.userId))
		.all()
		.map((r) => r.id);
}

function parseHorizon(value: unknown): Horizon {
	if (!isHorizon(value)) throw new ValidationError('Pick a horizon');
	return value;
}

/**
 * The date the user picked, or nothing.
 *
 * `periodStart` snaps it to the start of the period it lands in, so two goals
 * in one quarter agree on where that quarter begins. The form shows which
 * period the date resolves to rather than describing the snapping.
 */
function parseAnchor(value: unknown): Date | null {
	const raw = value === undefined || value === null ? '' : String(value).trim();
	if (!raw) return null;
	if (!DATE_PATTERN.test(raw)) throw new ValidationError('date is malformed');
	return new Date(`${raw}T00:00:00`);
}

function parseTarget(value: unknown): number | null {
	if (value === undefined || value === null || String(value).trim() === '') return null;
	return num(value, 'target', { min: 0.000001 });
}

function parseColor(value: unknown): string | null {
	if (value === undefined || value === null || String(value).trim() === '') return null;
	const color = String(value).trim();
	if (!HEX_COLOR.test(color)) throw new ValidationError('Invalid color format');
	return color;
}
