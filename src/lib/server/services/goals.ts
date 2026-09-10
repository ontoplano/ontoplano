/**
 * Goals, and the progress that makes them more than a wish list.
 *
 * A goal linked to tasks has progress that can be counted: how many of the
 * occurrences it covers actually got done inside its period. That is the whole
 * point of linking — a self-reported number tells you what you believe, and the
 * execution log tells you what happened.
 *
 * What it is measured by lives in `goal_targets`, one row per thing, because a
 * goal worth making usually wants more than one: three gigs played and five
 * songs recorded is a single commitment with two numbers under it. The goal is
 * as far along as everything measuring it is on average.
 */
import { and, asc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
	activities,
	categories,
	goalAreas,
	goalLinks,
	goalTargets,
	goals,
	notebooks,
	todoTasks,
	taskRecords,
	recurringTasks
} from '../db/schema.js';
import { periodEnd, periodStart, isGoalStatus, isHorizon, type Horizon } from '../../goals.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { ownedNotebookId } from './notebooks.js';
import { created, stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';
import { blockName } from '../../planner-grid.js';

export type GoalArea = { id: number; name: string; color: string; sortOrder: number };

export type GoalProgress = {
	/** Occurrences of linked tasks inside the period. Null when nothing is linked. */
	total: number | null;
	done: number | null;
	/** 0-1, averaged over everything the goal is measured by. */
	fraction: number | null;
};

/** One thing a goal is measured by. A goal can want several at once. */
export type GoalTarget = {
	id: number;
	targetValue: number;
	currentValue: number;
	unit: string;
	/** 0-1, how far this one measure has got. */
	fraction: number;
};

export type Goal = {
	id: number;
	areaId: number | null;
	areaName: string | null;
	areaColor: string | null;
	notebookId: number | null;
	notebookTitle: string | null;
	parentId: number | null;
	title: string;
	notes: string;
	horizon: Horizon;
	periodStart: string;
	targets: GoalTarget[];
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
 * How far along one goal is.
 *
 * Two things can move it and a goal may have both. Linked weekly slots
 * contribute every occurrence they produced inside the period; linked
 * activities contribute any occurrence resolved to them, which is how "do more
 * of X" works without naming a particular slot; todos count once each. The
 * measures under the goal contribute what has been typed into them.
 *
 * Everything the goal is measured by counts once, and the goal is as far along
 * as those are on average — so half the gigs and none of the songs is a third
 * of the way, and a goal with an activity linked to it does not read as "0 of 0
 * done" while its own number says seven of twelve.
 */
function progressFor(
	ctx: Ctx,
	goal: { horizon: Horizon; periodStart: string },
	slotIds: number[],
	todoIds: number[],
	activityIds: number[],
	targets: GoalTarget[]
): GoalProgress {
	const measured = targets.map((t) => t.fraction);
	const average = (parts: number[]) =>
		parts.length === 0 ? null : parts.reduce((sum, p) => sum + p, 0) / parts.length;

	const linked = slotIds.length + todoIds.length + activityIds.length;
	if (linked === 0) return { total: null, done: null, fraction: average(measured) };

	const from = goal.periodStart;
	const to = periodEnd(goal.horizon, goal.periodStart);

	let total = 0;
	let done = 0;

	if (slotIds.length > 0 || activityIds.length > 0) {
		const rows = db
			.select({
				status: taskRecords.status,
				slotId: taskRecords.slotId,
				resolvedActivityId: taskRecords.resolvedActivityId
			})
			.from(taskRecords)
			.where(
				and(
					eq(taskRecords.userId, ctx.userId),
					gte(taskRecords.scheduledAt, `${from}T00:00:00`),
					lt(taskRecords.scheduledAt, `${to}T00:00:00`)
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
			.select({ status: todoTasks.status })
			.from(todoTasks)
			.where(and(eq(todoTasks.userId, ctx.userId), inArray(todoTasks.id, todoIds)))
			.all();
		total += rows.length;
		done += rows.filter((r) => r.status === 'done').length;
	}

	// Nothing scheduled inside the period yet is not the same as nothing done,
	// so an empty count sits out of the average rather than dragging it to zero.
	return {
		total,
		done,
		fraction: average(total > 0 ? [done / total, ...measured] : measured)
	};
}

export function listGoals(ctx: Ctx, opts: { includeClosed?: boolean } = {}): Goal[] {
	const rows = db
		.select({
			id: goals.id,
			areaId: goals.areaId,
			areaName: goalAreas.name,
			areaColor: goalAreas.color,
			notebookId: goals.notebookId,
			notebookTitle: notebooks.title,
			parentId: goals.parentId,
			title: goals.title,
			notes: goals.notes,
			horizon: goals.horizon,
			periodStart: goals.periodStart,
			status: goals.status,
			outcome: goals.outcome,
			closedAt: goals.closedAt
		})
		.from(goals)
		.leftJoin(goalAreas, eq(goals.areaId, goalAreas.id))
		.leftJoin(notebooks, eq(goals.notebookId, notebooks.id))
		.where(eq(goals.userId, ctx.userId))
		.orderBy(asc(goals.periodStart), asc(goals.title))
		.all();

	const ids = rows.map((r) => r.id);
	const links =
		ids.length > 0 ? db.select().from(goalLinks).where(inArray(goalLinks.goalId, ids)).all() : [];
	const measures =
		ids.length > 0
			? db
					.select()
					.from(goalTargets)
					.where(inArray(goalTargets.goalId, ids))
					.orderBy(asc(goalTargets.sortOrder), asc(goalTargets.id))
					.all()
			: [];

	return rows
		.filter((r) => opts.includeClosed || r.status === 'open')
		.map((r): Goal => {
			const mine = links.filter((l) => l.goalId === r.id);
			const linkedSlotIds = mine.map((l) => l.slotId).filter((v): v is number => v !== null);
			const linkedTodoIds = mine.map((l) => l.todoId).filter((v): v is number => v !== null);
			const linkedActivityIds = mine
				.map((l) => l.activityId)
				.filter((v): v is number => v !== null);

			const targets = measures
				.filter((t) => t.goalId === r.id)
				.map(
					(t): GoalTarget => ({
						id: t.id,
						targetValue: t.targetValue,
						currentValue: t.currentValue,
						unit: t.unit,
						fraction: Math.min(t.currentValue / t.targetValue, 1)
					})
				);

			return {
				id: r.id,
				areaId: r.areaId,
				areaName: r.areaName,
				areaColor: r.areaColor,
				notebookId: r.notebookId,
				notebookTitle: r.notebookTitle,
				parentId: r.parentId,
				title: r.title,
				notes: r.notes ?? '',
				horizon: r.horizon,
				periodStart: r.periodStart,
				targets,
				status: r.status,
				outcome: r.outcome ?? '',
				closedAt: r.closedAt,
				linkedSlotIds,
				linkedTodoIds,
				linkedActivityIds,
				progress: progressFor(ctx, r, linkedSlotIds, linkedTodoIds, linkedActivityIds, targets)
			};
		});
}

/** Goals whose period covers `date`, for the dashboard card. */
export function listActiveOn(ctx: Ctx, date: string): Goal[] {
	return listGoals(ctx).filter(
		(g) => date >= g.periodStart && date < periodEnd(g.horizon, g.periodStart)
	);
}

/**
 * The blocks a goal can be linked to, each with the name it goes by.
 *
 * The name follows the same rule as the grid — activity, then label, then
 * category — because a list that showed the label alone printed "block 47" for
 * every block that had never been given one, which is most of them.
 */
export function linkableSlots(ctx: Ctx) {
	return db
		.select({
			id: recurringTasks.id,
			label: recurringTasks.label,
			mode: recurringTasks.mode,
			weekday: recurringTasks.weekday,
			startTime: recurringTasks.startTime,
			activityId: recurringTasks.activityId,
			activityName: activities.name,
			categoryName: categories.name
		})
		.from(recurringTasks)
		.leftJoin(activities, eq(recurringTasks.activityId, activities.id))
		.leftJoin(categories, eq(recurringTasks.categoryId, categories.id))
		.where(and(eq(recurringTasks.userId, ctx.userId), eq(recurringTasks.active, true)))
		.orderBy(asc(recurringTasks.weekday), asc(recurringTasks.startTime))
		.all()
		.map((slot) => ({ ...slot, name: blockName(slot) }));
}

// --- Mutations ----------------------------------------------------------------

export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTES_LENGTH = 4000;
export const MAX_UNIT_LENGTH = 40;
export const MAX_OUTCOME_LENGTH = 2000;
/** Measures on one goal. A goal that wants a dozen things is several goals. */
export const MAX_TARGETS = 12;
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
		notebookId?: unknown;
		parentId?: unknown;
		targets?: unknown;
	}
): number {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	const horizon = parseHorizon(raw.horizon);
	const anchor = parseAnchor(raw.startDate) ?? ctx.now;
	const targets = parseTargets(raw.targets) ?? [];
	const areaId = ownedAreaId(ctx, raw.areaId);
	const notebookId = ownedNotebookId(ctx, raw.notebookId);
	const parentId = ownedGoalId(ctx, raw.parentId);

	return db.transaction((tx) => {
		const result = tx
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
				areaId,
				notebookId,
				parentId
			})
			.run();

		const id = Number(result.lastInsertRowid);
		targets.forEach((t, i) => {
			tx.insert(goalTargets)
				.values({
					userId: ctx.userId,
					goalId: id,
					targetValue: t.value,
					unit: t.unit,
					sortOrder: i
				})
				.run();
		});
		return id;
	});
}

export function updateGoal(
	ctx: Ctx,
	id: number,
	raw: {
		title: unknown;
		notes?: unknown;
		areaId?: unknown;
		notebookId?: unknown;
		targets?: unknown;
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
	// Left out means left alone: a caller that only renames a goal must not
	// wipe what it is measured by. The form posts every row it shows, so an
	// emptied list there does mean "no measures".
	const targets = parseTargets(raw.targets);
	const areaId = ownedAreaId(ctx, raw.areaId);
	const notebookId = ownedNotebookId(ctx, raw.notebookId);
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	const notes = optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH });

	db.transaction((tx) => {
		const res = tx
			.update(goals)
			.set({
				title,
				notes,
				areaId,
				notebookId,
				horizon,
				periodStart: periodStart(horizon, anchor),
				updatedAt: stamp(ctx)
			})
			.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
			.run();

		if (res.changes === 0) throw new NotFoundError('goal');
		if (!targets) return;

		const existing = tx
			.select({ id: goalTargets.id })
			.from(goalTargets)
			.where(and(eq(goalTargets.goalId, id), eq(goalTargets.userId, ctx.userId)))
			.all()
			.map((t) => t.id);

		// A measure that is edited keeps the number already on it — retyping the
		// unit of "5 / 12 books" must not send it back to zero.
		const kept = new Set<number>();
		targets.forEach((t, i) => {
			if (t.id !== null && existing.includes(t.id)) {
				kept.add(t.id);
				tx.update(goalTargets)
					.set({ targetValue: t.value, unit: t.unit, sortOrder: i })
					.where(and(eq(goalTargets.id, t.id), eq(goalTargets.userId, ctx.userId)))
					.run();
				return;
			}
			tx.insert(goalTargets)
				.values({
					userId: ctx.userId,
					goalId: id,
					targetValue: t.value,
					unit: t.unit,
					sortOrder: i
				})
				.run();
		});

		for (const gone of existing) {
			if (kept.has(gone)) continue;
			tx.delete(goalTargets)
				.where(and(eq(goalTargets.id, gone), eq(goalTargets.userId, ctx.userId)))
				.run();
		}
	});
}

/** Add one measure to a goal, leaving the ones already on it alone. */
export function addGoalTarget(
	ctx: Ctx,
	goalId: number,
	raw: { value: unknown; unit?: unknown }
): number {
	assertOwnedGoal(ctx, goalId);

	const value = num(raw.value, 'target', { min: 0.000001 });
	const unit = optionalStr(raw.unit, 'unit', { max: MAX_UNIT_LENGTH });
	const existing = db
		.select({ id: goalTargets.id })
		.from(goalTargets)
		.where(and(eq(goalTargets.goalId, goalId), eq(goalTargets.userId, ctx.userId)))
		.all();

	if (existing.length >= MAX_TARGETS)
		throw new ValidationError(`A goal can be measured by at most ${MAX_TARGETS} things`);

	const result = db
		.insert(goalTargets)
		.values({
			userId: ctx.userId,
			goalId,
			targetValue: value,
			unit,
			sortOrder: existing.length
		})
		.run();

	touchGoal(ctx, goalId);
	return Number(result.lastInsertRowid);
}

/** And the way back off it. The goal and its other measures stay. */
export function removeGoalTarget(ctx: Ctx, targetId: number): void {
	const goalId = ownedTargetGoal(ctx, targetId);

	const res = db
		.delete(goalTargets)
		.where(and(eq(goalTargets.id, targetId), eq(goalTargets.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('target');
	touchGoal(ctx, goalId);
}

/** Self-reported progress on one measure — the number somebody types in. */
export function setTargetProgress(ctx: Ctx, targetId: number, value: unknown): void {
	const currentValue = num(value, 'progress', { min: 0 });
	const goalId = ownedTargetGoal(ctx, targetId);

	const res = db
		.update(goalTargets)
		.set({ currentValue })
		.where(and(eq(goalTargets.id, targetId), eq(goalTargets.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('target');
	// The weekly review asks which goals moved, and it asks the goal — so a
	// number typed into one of its measures has to reach the goal's own row.
	touchGoal(ctx, goalId);
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
		tx.delete(goalLinks)
			.where(and(eq(goalLinks.goalId, id), eq(goalLinks.userId, ctx.userId)))
			.run();

		const link = (values: { slotId?: number; todoId?: number; activityId?: number }) =>
			tx
				.insert(goalLinks)
				.values({ userId: ctx.userId, goalId: id, ...values })
				.run();

		for (const slotId of slotIds) link({ slotId });
		for (const todoId of todoIds) link({ todoId });
		for (const activityId of activityIds) link({ activityId });
	});
}

/**
 * Add work to a goal without disturbing what is already on it.
 *
 * `setGoalLinks` replaces the whole set, which is right for the page — a form
 * that shows every checkbox and posts all of them — and dangerous for anybody
 * else. A caller that knows about three todos and calls it unlinks everything
 * it did not know about, silently, and the progress bar drops with no
 * explanation on screen. An assistant asked to "make tasks for this goal" is
 * exactly that caller.
 *
 * So: additive, idempotent, and it answers with how many links are new.
 */
export function addGoalLinks(
	ctx: Ctx,
	id: number,
	links: { slotIds?: unknown[]; todoIds?: unknown[]; activityIds?: unknown[] }
): { added: number } {
	assertOwnedGoal(ctx, id);

	const slotIds = ownedIds(links.slotIds ?? [], ownedSlotIds(ctx));
	const todoIds = ownedIds(links.todoIds ?? [], ownedTodoIds(ctx));
	const activityIds = ownedIds(links.activityIds ?? [], ownedActivityIds(ctx));

	const existing = db
		.select({
			slotId: goalLinks.slotId,
			todoId: goalLinks.todoId,
			activityId: goalLinks.activityId
		})
		.from(goalLinks)
		.where(and(eq(goalLinks.goalId, id), eq(goalLinks.userId, ctx.userId)))
		.all();

	const has = (kind: 'slotId' | 'todoId' | 'activityId', value: number) =>
		existing.some((row) => row[kind] === value);

	let added = 0;
	db.transaction((tx) => {
		const link = (values: { slotId?: number; todoId?: number; activityId?: number }) => {
			tx.insert(goalLinks)
				.values({ userId: ctx.userId, goalId: id, ...values })
				.run();
			added += 1;
		};

		for (const slotId of slotIds) if (!has('slotId', slotId)) link({ slotId });
		for (const todoId of todoIds) if (!has('todoId', todoId)) link({ todoId });
		for (const activityId of activityIds) if (!has('activityId', activityId)) link({ activityId });
	});

	return { added };
}

/** And the way back off it, one link at a time. */
export function removeGoalLinks(
	ctx: Ctx,
	id: number,
	links: { slotIds?: unknown[]; todoIds?: unknown[]; activityIds?: unknown[] }
): { removed: number } {
	assertOwnedGoal(ctx, id);

	const slotIds = ownedIds(links.slotIds ?? [], ownedSlotIds(ctx));
	const todoIds = ownedIds(links.todoIds ?? [], ownedTodoIds(ctx));
	const activityIds = ownedIds(links.activityIds ?? [], ownedActivityIds(ctx));

	let removed = 0;
	db.transaction((tx) => {
		// A condition rather than a column: the three columns are three distinct
		// types to Drizzle, and one helper cannot take all of them.
		const drop = (which: SQL) => {
			removed += tx
				.delete(goalLinks)
				.where(and(eq(goalLinks.goalId, id), eq(goalLinks.userId, ctx.userId), which))
				.run().changes;
		};

		for (const slotId of slotIds) drop(eq(goalLinks.slotId, slotId));
		for (const todoId of todoIds) drop(eq(goalLinks.todoId, todoId));
		for (const activityId of activityIds) drop(eq(goalLinks.activityId, activityId));
	});

	return { removed };
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
		.select({ id: recurringTasks.id })
		.from(recurringTasks)
		.where(eq(recurringTasks.userId, ctx.userId))
		.all()
		.map((r) => r.id);
}

function ownedTodoIds(ctx: Ctx): number[] {
	return db
		.select({ id: todoTasks.id })
		.from(todoTasks)
		.where(eq(todoTasks.userId, ctx.userId))
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
	if (!DATE_PATTERN.test(raw)) throw new ValidationError('Invalid date');
	return new Date(`${raw}T00:00:00`);
}

/**
 * The measures posted with a goal, or nothing if none were posted at all.
 *
 * The form sends one row per measure and an empty row for the one somebody
 * started typing into and abandoned, so a row with neither a number nor a unit
 * is dropped rather than refused. A row with a unit and no number is a mistake
 * worth saying out loud: "5 books" and "books" are not the same claim.
 */
function parseTargets(value: unknown): { id: number | null; value: number; unit: string }[] | null {
	if (value === undefined || value === null) return null;
	if (!Array.isArray(value)) throw new ValidationError('Invalid measures');

	const out: { id: number | null; value: number; unit: string }[] = [];
	for (const entry of value) {
		const row = (entry ?? {}) as { id?: unknown; value?: unknown; unit?: unknown };
		const rawValue = row.value === undefined || row.value === null ? '' : String(row.value).trim();
		const unit = optionalStr(row.unit, 'unit', { max: MAX_UNIT_LENGTH });
		if (rawValue === '' && unit === '') continue;
		out.push({
			id:
				row.id === undefined || row.id === null || String(row.id).trim() === ''
					? null
					: num(row.id, 'measure', { int: true, min: 1 }),
			value: num(rawValue, 'target', { min: 0.000001 }),
			unit
		});
	}

	if (out.length > MAX_TARGETS)
		throw new ValidationError(`A goal can be measured by at most ${MAX_TARGETS} things`);
	return out;
}

/** The goal a measure belongs to, refusing anybody else's. */
function ownedTargetGoal(ctx: Ctx, targetId: number): number {
	const owned = db
		.select({ goalId: goalTargets.goalId })
		.from(goalTargets)
		.where(and(eq(goalTargets.id, targetId), eq(goalTargets.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('target');
	return owned.goalId;
}

function touchGoal(ctx: Ctx, goalId: number): void {
	db.update(goals)
		.set({ updatedAt: stamp(ctx) })
		.where(and(eq(goals.id, goalId), eq(goals.userId, ctx.userId)))
		.run();
}

function parseColor(value: unknown): string | null {
	if (value === undefined || value === null || String(value).trim() === '') return null;
	const color = String(value).trim();
	if (!HEX_COLOR.test(color)) throw new ValidationError('Invalid color format');
	return color;
}
