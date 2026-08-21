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
import { categories, plannerTodos } from '../db/schema.js';
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
