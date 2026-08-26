/**
 * Todos: tasks that have no date yet.
 *
 * A todo and a scheduled block are the same kind of thing at different stages.
 * The difference is `scheduledDate`: null means it lives in the general list,
 * a date means it has been pulled onto that day's board. Setting it is what
 * dragging a card onto Today does — the same row acquires a day rather than
 * being copied into a second table, so nothing has to be kept in sync.
 */
import { and, asc, eq, isNull, notInArray, or } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
	activities,
	categories,
	exceptionalSlots,
	notebooks,
	plannerTodos,
	taskInstances
} from '../db/schema.js';
import { CLOSED_STATUSES, isStatus, type Status } from '../../task-status.js';
import type { RatingValues } from '../../ratings.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { ownedNotebookId } from './notebooks.js';
import { created, stamp, stamps } from './time.js';
import { num, oneOf, optionalStr, str } from './validate.js';

export type Todo = {
	id: number;
	title: string;
	notes: string;
	status: Status;
	scheduledDate: string | null;
	sortOrder: number;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	notebookId: number | null;
	notebookTitle: string | null;
	ratings: RatingValues;
	createdAt: string;
	updatedAt: string;
};

const SELECTION = {
	id: plannerTodos.id,
	title: plannerTodos.title,
	notes: plannerTodos.notes,
	status: plannerTodos.status,
	scheduledDate: plannerTodos.scheduledDate,
	sortOrder: plannerTodos.sortOrder,
	categoryId: plannerTodos.categoryId,
	categoryName: categories.name,
	categoryColor: categories.color,
	notebookId: plannerTodos.notebookId,
	notebookTitle: notebooks.title,
	urgency: plannerTodos.urgency,
	interest: plannerTodos.interest,
	energy: plannerTodos.energy,
	createdAt: plannerTodos.createdAt,
	updatedAt: plannerTodos.updatedAt
};

function shape(r: Record<string, unknown>): Todo {
	return {
		id: r.id as number,
		title: r.title as string,
		notes: (r.notes as string) ?? '',
		status: r.status as Status,
		scheduledDate: (r.scheduledDate as string) ?? null,
		sortOrder: r.sortOrder as number,
		categoryId: (r.categoryId as number) ?? null,
		categoryName: (r.categoryName as string) ?? null,
		categoryColor: (r.categoryColor as string) ?? null,
		notebookId: (r.notebookId as number) ?? null,
		notebookTitle: (r.notebookTitle as string) ?? null,
		ratings: {
			urgency: (r.urgency as number) ?? null,
			interest: (r.interest as number) ?? null,
			energy: (r.energy as number) ?? null
		},
		createdAt: r.createdAt as string,
		updatedAt: r.updatedAt as string
	};
}

/** Everything, ordered the way the board wants it. */
export function listTodos(ctx: Ctx): Todo[] {
	return db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.leftJoin(notebooks, eq(plannerTodos.notebookId, notebooks.id))
		.where(eq(plannerTodos.userId, ctx.userId))
		.orderBy(asc(plannerTodos.sortOrder), asc(plannerTodos.createdAt))
		.all()
		.map(shape);
}

/**
 * The general list: todos not pulled onto a particular day.
 *
 * `openOnly` drops the ones already finished or skipped. The board wants them
 * — its Done column is where they live — but anywhere that offers a todo to be
 * *scheduled* wants only the ones still waiting, because asking somebody when
 * they will do a thing they already did is nonsense.
 */
export function listUnscheduled(ctx: Ctx, options: { openOnly?: boolean } = {}): Todo[] {
	return db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.leftJoin(notebooks, eq(plannerTodos.notebookId, notebooks.id))
		.where(
			and(
				eq(plannerTodos.userId, ctx.userId),
				isNull(plannerTodos.scheduledDate),
				options.openOnly ? notInArray(plannerTodos.status, [...CLOSED_STATUSES]) : undefined
			)
		)
		.orderBy(asc(plannerTodos.sortOrder), asc(plannerTodos.createdAt))
		.all()
		.map(shape);
}

/**
 * Todos sitting on one day's board.
 *
 * Anything still open from an earlier day is included, because a todo you
 * pulled onto Monday and did not finish has not stopped needing doing — it
 * would otherwise vanish silently at midnight.
 */
export function listForDate(ctx: Ctx, date: string): Todo[] {
	const rows = db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.leftJoin(notebooks, eq(plannerTodos.notebookId, notebooks.id))
		.where(and(eq(plannerTodos.userId, ctx.userId), eq(plannerTodos.scheduledDate, date)))
		.orderBy(asc(plannerTodos.sortOrder), asc(plannerTodos.createdAt))
		.all()
		.map(shape);

	const overdue = db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.leftJoin(notebooks, eq(plannerTodos.notebookId, notebooks.id))
		.where(
			and(
				eq(plannerTodos.userId, ctx.userId),
				or(eq(plannerTodos.status, 'todo'), eq(plannerTodos.status, 'doing'))
			)
		)
		.orderBy(asc(plannerTodos.sortOrder), asc(plannerTodos.createdAt))
		.all()
		.map(shape)
		.filter((t) => t.scheduledDate !== null && t.scheduledDate < date);

	return [...overdue, ...rows];
}

/** Next free slot at the bottom of a column, so a new card lands last. */
export function nextSortOrder(ctx: Ctx): number {
	const rows = db
		.select({ sortOrder: plannerTodos.sortOrder })
		.from(plannerTodos)
		.where(eq(plannerTodos.userId, ctx.userId))
		.all();
	return rows.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;
}

/**
 * Turn a todo into a scheduled block.
 *
 * A todo pulled onto a day stops being a todo: it becomes a one-off with a
 * time, which is what puts it on the grid, in the tracker, and against a goal.
 * The row moves rather than being copied, so there is never a todo and a task
 * that are secretly the same thing.
 *
 * Shared by the board, where it is a drop into a status column, and the plan
 * grid, where it is a drop at a particular hour.
 */
export function promoteTodo(
	ctx: Ctx,
	input: {
		todoId: number;
		date: string;
		startTime: string;
		durationMinutes?: number;
		status?: Status;
	}
): { ok: true } | { ok: false; message: string } {
	const todo = db
		.select()
		.from(plannerTodos)
		.where(and(eq(plannerTodos.id, input.todoId), eq(plannerTodos.userId, ctx.userId)))
		.get();
	if (!todo) return { ok: false, message: 'Todo not found' };

	// A block must name a category or an activity; a todo need not. Falling back
	// to the first category beats refusing the drag over a field the user never
	// filled in.
	const categoryId =
		todo.categoryId ??
		db
			.select({ id: categories.id })
			.from(categories)
			.where(eq(categories.userId, ctx.userId))
			.orderBy(categories.name)
			.get()?.id;

	if (!categoryId) return { ok: false, message: 'Create a category before scheduling todos' };

	db.transaction((tx) => {
		const slot = tx
			.insert(exceptionalSlots)
			.values({
				...created(ctx),
				userId: ctx.userId,
				date: input.date,
				startTime: input.startTime,
				durationMinutes: input.durationMinutes ?? 30,
				mode: 'category',
				categoryId,
				label: todo.title,
				// Scheduling something must not quietly remove it from its subject.
				notebookId: todo.notebookId,
				urgency: todo.urgency,
				interest: todo.interest,
				energy: todo.energy
			})
			.returning({ id: exceptionalSlots.id })
			.get();

		tx.insert(taskInstances)
			.values({
				...created(ctx),
				userId: ctx.userId,
				exceptionalSlotId: slot.id,
				scheduledAt: `${input.date}T${input.startTime}:00`,
				status: input.status ?? todo.status,
				// Notes are the one thing a block has nowhere to put, so they ride
				// on the instance.
				notes: todo.notes ?? ''
			})
			.run();

		tx.delete(plannerTodos)
			.where(and(eq(plannerTodos.id, input.todoId), eq(plannerTodos.userId, ctx.userId)))
			.run();
	});

	return { ok: true };
}

// --- Mutations ----------------------------------------------------------------

export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTES_LENGTH = 4000;
export const MAX_LABEL_LENGTH = 300;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export type TodoInput = {
	title: unknown;
	notes?: unknown;
	categoryId?: unknown;
	notebookId?: unknown;
	scheduledDate?: unknown;
	status?: unknown;
	ratings?: Partial<RatingValues>;
};

export function createTodo(ctx: Ctx, raw: TodoInput): number {
	const result = db
		.insert(plannerTodos)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			title: str(raw.title, 'title', { max: MAX_TITLE_LENGTH }),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			categoryId: ownedCategoryId(ctx, raw.categoryId),
			notebookId: ownedNotebookId(ctx, raw.notebookId),
			scheduledDate: optionalDate(raw.scheduledDate),
			status: isStatus(raw.status) ? raw.status : 'todo',
			sortOrder: nextSortOrder(ctx),
			...(raw.ratings ?? {})
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updateTodo(ctx: Ctx, id: number, raw: TodoInput): void {
	const res = db
		.update(plannerTodos)
		.set({
			title: str(raw.title, 'title', { max: MAX_TITLE_LENGTH }),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			categoryId: ownedCategoryId(ctx, raw.categoryId),
			notebookId: ownedNotebookId(ctx, raw.notebookId),
			...(raw.ratings ?? {}),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
}

export function setTodoStatus(ctx: Ctx, id: number, status: unknown): void {
	if (!isStatus(status)) throw new ValidationError('Invalid status');

	const res = db
		.update(plannerTodos)
		.set({
			status,
			// `completed` is kept in step for anything still reading it, and so
			// existing data stays meaningful either way round.
			completed: status === 'done',
			updatedAt: stamp(ctx)
		})
		.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
}

/**
 * Pull a todo onto a day, or push it back to the general list.
 *
 * One column changes. Nothing is copied, so there is no second row to keep in
 * sync and no way for the two to disagree.
 */
export function scheduleTodo(ctx: Ctx, id: number, date: unknown): void {
	const res = db
		.update(plannerTodos)
		.set({ scheduledDate: optionalDate(date), updatedAt: stamp(ctx) })
		.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
}

export function deleteTodo(ctx: Ctx, id: number): void {
	const res = db
		.delete(plannerTodos)
		.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
}

/**
 * Give a todo a time on a day, keeping the todo.
 *
 * Unlike `promoteTodo`, which moves the row, this leaves the todo in place and
 * marks it done — it is the "I did this at 3pm" gesture rather than "this is
 * now a planned block".
 */
export function delegateTodo(
	ctx: Ctx,
	id: number,
	raw: {
		date: unknown;
		startTime: unknown;
		durationMinutes?: unknown;
		mode: unknown;
		categoryId?: unknown;
		activityId?: unknown;
	}
): void {
	const date = requiredDate(raw.date);
	const startTime = str(raw.startTime, 'time', { max: 5, pattern: TIME_PATTERN });
	const durationMinutes =
		raw.durationMinutes === undefined || raw.durationMinutes === null || raw.durationMinutes === ''
			? 60
			: num(raw.durationMinutes, 'duration', { int: true, min: 1, max: 24 * 60 });
	const mode = oneOf(raw.mode, 'mode', ['category', 'activity'] as const);
	const categoryId = ownedCategoryId(ctx, raw.categoryId);
	const activityId = ownedActivityId(ctx, raw.activityId);

	if (mode === 'category' && !categoryId) throw new ValidationError('Category required');
	if (mode === 'activity' && !activityId) throw new ValidationError('Activity required');

	const todo = db
		.select({ title: plannerTodos.title, notebookId: plannerTodos.notebookId })
		.from(plannerTodos)
		.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
		.get();

	if (!todo) throw new NotFoundError('todo');

	db.transaction((tx) => {
		tx.insert(exceptionalSlots)
			.values({
				...created(ctx),
				userId: ctx.userId,
				date,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label: todo.title.slice(0, MAX_LABEL_LENGTH),
				// As with promoting: giving a task a time must not take it out of
				// the notebook it belongs to.
				notebookId: todo.notebookId
			})
			.run();

		tx.update(plannerTodos)
			.set({ completed: true, updatedAt: stamp(ctx) })
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
			.run();
	});
}

function requiredDate(value: unknown): string {
	return str(value, 'date', { max: 10, pattern: DATE_PATTERN });
}

function optionalDate(value: unknown): string | null {
	if (value === undefined || value === null || String(value).trim() === '') return null;
	return requiredDate(String(value).trim());
}

/** An id from a form is a claim until it is checked against the account. */
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
 * Where the cards sit in a column, after a drag.
 *
 * Ids the account does not own simply do not match, so a posted list can
 * reorder nothing but its own todos.
 */
export function reorderTodos(ctx: Ctx, ids: unknown[]): void {
	const ordered = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
	if (ordered.length === 0) throw new ValidationError('Bad ordering');

	const now = stamp(ctx);
	db.transaction((tx) => {
		ordered.forEach((id, index) => {
			tx.update(plannerTodos)
				.set({ sortOrder: index, updatedAt: now })
				.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
				.run();
		});
	});
}

export function setTodoRatings(ctx: Ctx, id: number, ratings: Partial<RatingValues>): void {
	if (Object.keys(ratings).length === 0) return;

	const res = db
		.update(plannerTodos)
		.set({ ...ratings, updatedAt: stamp(ctx) })
		.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
}

/**
 * The reverse of `promoteTodo`: a one-off block goes back to being a todo.
 *
 * Only one-offs can go back. A weekly block is a standing commitment, not a
 * todo that happens to have a time.
 */
export function demoteInstance(ctx: Ctx, instanceId: number): void {
	const instance = db
		.select({
			exceptionalSlotId: taskInstances.exceptionalSlotId,
			status: taskInstances.status,
			notes: taskInstances.notes,
			urgencyOverride: taskInstances.urgencyOverride,
			interestOverride: taskInstances.interestOverride,
			energyOverride: taskInstances.energyOverride,
			label: exceptionalSlots.label,
			categoryId: exceptionalSlots.categoryId,
			urgency: exceptionalSlots.urgency,
			interest: exceptionalSlots.interest,
			energy: exceptionalSlots.energy
		})
		.from(taskInstances)
		.innerJoin(exceptionalSlots, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
		.where(and(eq(taskInstances.id, instanceId), eq(taskInstances.userId, ctx.userId)))
		.get();

	if (!instance) throw new ValidationError('Only one-off blocks can go back to the todo list');

	const sortOrder = nextSortOrder(ctx);

	db.transaction((tx) => {
		tx.insert(plannerTodos)
			.values({
				...stamps(ctx),
				userId: ctx.userId,
				title: instance.label || 'Untitled',
				notes: instance.notes ?? '',
				categoryId: instance.categoryId,
				status: instance.status,
				completed: instance.status === 'done',
				sortOrder,
				urgency: instance.urgencyOverride ?? instance.urgency,
				interest: instance.interestOverride ?? instance.interest,
				energy: instance.energyOverride ?? instance.energy
			})
			.run();

		// The instance goes with it, by cascade.
		tx.delete(exceptionalSlots)
			.where(
				and(
					eq(exceptionalSlots.id, instance.exceptionalSlotId!),
					eq(exceptionalSlots.userId, ctx.userId)
				)
			)
			.run();
	});
}
