/**
 * Todos: tasks that have no date yet.
 *
 * A todo and a scheduled block are the same kind of thing at different stages.
 * The difference is `scheduledDate`: null means it lives in the general list,
 * a date means it has been pulled onto that day's board. Setting it is what
 * dragging a card onto Today does — the same row acquires a day rather than
 * being copied into a second table, so nothing has to be kept in sync.
 */
import { and, asc, eq, isNull, or } from 'drizzle-orm';

import { db } from '../db/index.js';
import { categories, exceptionalSlots, plannerTodos, taskInstances } from '../db/schema.js';
import type { Status } from '../../task-status.js';
import type { RatingValues } from '../../ratings.js';

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
export function listTodos(userId: string): Todo[] {
	return db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.where(eq(plannerTodos.userId, userId))
		.orderBy(asc(plannerTodos.sortOrder), asc(plannerTodos.createdAt))
		.all()
		.map(shape);
}

/** The general list: todos not pulled onto a particular day. */
export function listUnscheduled(userId: string): Todo[] {
	return db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.where(and(eq(plannerTodos.userId, userId), isNull(plannerTodos.scheduledDate)))
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
export function listForDate(userId: string, date: string): Todo[] {
	const rows = db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.where(and(eq(plannerTodos.userId, userId), eq(plannerTodos.scheduledDate, date)))
		.orderBy(asc(plannerTodos.sortOrder), asc(plannerTodos.createdAt))
		.all()
		.map(shape);

	const overdue = db
		.select(SELECTION)
		.from(plannerTodos)
		.leftJoin(categories, eq(plannerTodos.categoryId, categories.id))
		.where(
			and(
				eq(plannerTodos.userId, userId),
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
export function nextSortOrder(userId: string): number {
	const rows = db
		.select({ sortOrder: plannerTodos.sortOrder })
		.from(plannerTodos)
		.where(eq(plannerTodos.userId, userId))
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
	userId: string,
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
		.where(and(eq(plannerTodos.id, input.todoId), eq(plannerTodos.userId, userId)))
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
			.where(eq(categories.userId, userId))
			.orderBy(categories.name)
			.get()?.id;

	if (!categoryId) return { ok: false, message: 'Create a category before scheduling todos' };

	db.transaction((tx) => {
		const slot = tx
			.insert(exceptionalSlots)
			.values({
				userId,
				date: input.date,
				startTime: input.startTime,
				durationMinutes: input.durationMinutes ?? 30,
				mode: 'category',
				categoryId,
				label: todo.title,
				urgency: todo.urgency,
				interest: todo.interest,
				energy: todo.energy
			})
			.returning({ id: exceptionalSlots.id })
			.get();

		tx.insert(taskInstances)
			.values({
				userId,
				exceptionalSlotId: slot.id,
				scheduledAt: `${input.date}T${input.startTime}:00`,
				status: input.status ?? todo.status,
				// Notes are the one thing a block has nowhere to put, so they ride
				// on the instance.
				notes: todo.notes ?? ''
			})
			.run();

		tx.delete(plannerTodos)
			.where(and(eq(plannerTodos.id, input.todoId), eq(plannerTodos.userId, userId)))
			.run();
	});

	return { ok: true };
}
