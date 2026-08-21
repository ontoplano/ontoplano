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
	goalAreas,
	goalLinks,
	goals,
	plannerTodos,
	taskInstances,
	weeklySlots
} from '../db/schema.js';
import { periodEnd, type Horizon } from '../../goals.js';

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

export function listAreas(userId: string): GoalArea[] {
	return db
		.select({
			id: goalAreas.id,
			name: goalAreas.name,
			color: goalAreas.color,
			sortOrder: goalAreas.sortOrder
		})
		.from(goalAreas)
		.where(eq(goalAreas.userId, userId))
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
	userId: string,
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
					eq(taskInstances.userId, userId),
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
			.where(and(eq(plannerTodos.userId, userId), inArray(plannerTodos.id, todoIds)))
			.all();
		total += rows.length;
		done += rows.filter((r) => r.status === 'done').length;
	}

	return { total, done, fraction: total > 0 ? done / total : null };
}

export function listGoals(userId: string, opts: { includeClosed?: boolean } = {}): Goal[] {
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
		.where(eq(goals.userId, userId))
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
					userId,
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
export function listActiveOn(userId: string, date: string): Goal[] {
	return listGoals(userId).filter(
		(g) => date >= g.periodStart && date < periodEnd(g.horizon, g.periodStart)
	);
}

/** Weekly slots a goal can be linked to, for the picker. */
export function linkableSlots(userId: string) {
	return db
		.select({
			id: weeklySlots.id,
			label: weeklySlots.label,
			weekday: weeklySlots.weekday,
			startTime: weeklySlots.startTime,
			activityId: weeklySlots.activityId
		})
		.from(weeklySlots)
		.where(and(eq(weeklySlots.userId, userId), eq(weeklySlots.active, true)))
		.orderBy(asc(weeklySlots.weekday), asc(weeklySlots.startTime))
		.all();
}
