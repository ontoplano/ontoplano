/**
 * Todos: tasks that have no date yet.
 *
 * A todo and a scheduled block are the same kind of thing at different stages.
 * The difference is `scheduledDate`: null means it lives in the general list,
 * a date means it has been pulled onto that day's board. Setting it is what
 * dragging a card onto Today does — the same row acquires a day rather than
 * being copied into a second table, so nothing has to be kept in sync.
 */
import { and, asc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import {
	activities,
	categories,
	exceptionalTasks,
	notebooks,
	tags,
	todoTags,
	todoTasks,
	taskRecords,
	workouts
} from '$lib/db/schema.js';
import { CLOSED_STATUSES, isStatus, type Status } from '../task-status.js';
import type { RatingValues } from '../ratings.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { ownedNotebookId } from './notebooks.js';
import { cleanupOrphanTags, optionalTagInput, parseTags, replaceTodoTags } from './tags.js';
import { created, stamp, stamps } from './time.js';
import { host } from './host.js';
import { TIME_PATTERN, num, oneOf, optionalStr, str } from './validate.js';

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
	/** When it was put away, or null. Put away is not the same as finished. */
	archivedAt: string | null;
	/** When it was last finished, or null. Cleared when it is reopened. */
	completedAt: string | null;
	ratings: RatingValues;
	/**
	 * The labels on it, from the account's one tag vocabulary.
	 *
	 * Not a second vocabulary: a tag named on a diary entry is the same tag
	 * here. Several assistants working one list need a way to say which of them
	 * touched what — `a1`, `done`, `blocked` — and a label is how.
	 */
	tags: Tag[];
	createdAt: string;
	updatedAt: string;
};

export type Tag = { id: number; name: string };

const SELECTION = {
	id: todoTasks.id,
	title: todoTasks.title,
	notes: todoTasks.notes,
	status: todoTasks.status,
	completedAt: todoTasks.completedAt,
	scheduledDate: todoTasks.scheduledDate,
	sortOrder: todoTasks.sortOrder,
	categoryId: todoTasks.categoryId,
	categoryName: categories.name,
	categoryColor: categories.color,
	notebookId: todoTasks.notebookId,
	notebookTitle: notebooks.title,
	archivedAt: todoTasks.archivedAt,
	urgency: todoTasks.urgency,
	interest: todoTasks.interest,
	energy: todoTasks.energy,
	createdAt: todoTasks.createdAt,
	updatedAt: todoTasks.updatedAt
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
		archivedAt: (r.archivedAt as string) ?? null,
		completedAt: (r.completedAt as string) ?? null,
		ratings: {
			urgency: (r.urgency as number) ?? null,
			interest: (r.interest as number) ?? null,
			energy: (r.energy as number) ?? null
		},
		// Filled in by `withTags`, which reads them for a whole list at once.
		tags: (r.tags as Tag[]) ?? [],
		createdAt: r.createdAt as string,
		updatedAt: r.updatedAt as string
	};
}

/**
 * The tags on a set of todos, in one query rather than one per row.
 *
 * The same shape the notebooks use for a note's tags and people: a list comes
 * back, its ids go out in a single `IN`, and the rows are handed back by id.
 */
export function tagsForTodos(ctx: Ctx, todoIds: number[]): Map<number, Tag[]> {
	const byTodo = new Map<number, Tag[]>();
	if (todoIds.length === 0) return byTodo;

	const rows = db
		.select({ todoId: todoTags.todoId, id: tags.id, name: tags.name })
		.from(todoTags)
		.innerJoin(tags, eq(todoTags.tagId, tags.id))
		.where(and(inArray(todoTags.todoId, todoIds), eq(tags.userId, ctx.userId)))
		.orderBy(tags.name)
		.all();

	for (const row of rows) {
		const held = byTodo.get(row.todoId) ?? [];
		held.push({ id: row.id, name: row.name });
		byTodo.set(row.todoId, held);
	}
	return byTodo;
}

/** Every list of todos goes out through here, so none of them is missing its labels. */
function withTags(ctx: Ctx, todos: Todo[]): Todo[] {
	const byTodo = tagsForTodos(
		ctx,
		todos.map((t) => t.id)
	);
	for (const todo of todos) todo.tags = byTodo.get(todo.id) ?? [];
	return todos;
}

/**
 * Put a todo away, or take it back out.
 *
 * Neither done nor gone: a task somebody is not going to look at for a while
 * and is not willing to delete. Its own column rather than a fifth status,
 * because archived and unfinished are different answers to different
 * questions — coming back to it has to find it exactly as it was, and a status
 * would have had to remember what it used to be.
 */
export function archiveTodo(ctx: Ctx, id: number, away = true): void {
	const owned = db
		.select({ id: todoTasks.id })
		.from(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('todo');

	const now = stamp(ctx);
	db.update(todoTasks)
		.set({ archivedAt: away ? now : null, updatedAt: now })
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();
}

/** Everything, ordered the way the board wants it. */
export function listTodos(ctx: Ctx): Todo[] {
	const rows = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(eq(todoTasks.userId, ctx.userId))
		.orderBy(asc(todoTasks.sortOrder), asc(todoTasks.createdAt))
		.all()
		.map(shape);
	return withTags(ctx, rows);
}

/**
 * Everything filed under one notebook.
 *
 * The same rows `listTodos` returns, narrowed — the notebook's Tasks tab is
 * the to-do room looking at one subject, so it needs the whole todo rather
 * than a title and a status.
 */
export function listTodosIn(ctx: Ctx, notebookId: number): Todo[] {
	const rows = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(and(eq(todoTasks.notebookId, notebookId), eq(todoTasks.userId, ctx.userId)))
		.orderBy(asc(todoTasks.sortOrder), asc(todoTasks.createdAt))
		.all()
		.map(shape);
	return withTags(ctx, rows);
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
	const rows = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(
			and(
				eq(todoTasks.userId, ctx.userId),
				isNull(todoTasks.scheduledDate),
				options.openOnly ? notInArray(todoTasks.status, [...CLOSED_STATUSES]) : undefined
			)
		)
		.orderBy(asc(todoTasks.sortOrder), asc(todoTasks.createdAt))
		.all()
		.map(shape);
	return withTags(ctx, rows);
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
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(and(eq(todoTasks.userId, ctx.userId), eq(todoTasks.scheduledDate, date)))
		.orderBy(asc(todoTasks.sortOrder), asc(todoTasks.createdAt))
		.all()
		.map(shape);

	const overdue = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(
			and(
				eq(todoTasks.userId, ctx.userId),
				or(eq(todoTasks.status, 'todo'), eq(todoTasks.status, 'doing'))
			)
		)
		.orderBy(asc(todoTasks.sortOrder), asc(todoTasks.createdAt))
		.all()
		.map(shape)
		.filter((t) => t.scheduledDate !== null && t.scheduledDate < date);

	return withTags(ctx, [...overdue, ...rows]);
}

/** Next free slot at the bottom of a column, so a new card lands last. */
export function nextSortOrder(ctx: Ctx): number {
	const rows = db
		.select({ sortOrder: todoTasks.sortOrder })
		.from(todoTasks)
		.where(eq(todoTasks.userId, ctx.userId))
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
		.from(todoTasks)
		.where(and(eq(todoTasks.id, input.todoId), eq(todoTasks.userId, ctx.userId)))
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
			.insert(exceptionalTasks)
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
			.returning({ id: exceptionalTasks.id })
			.get();

		tx.insert(taskRecords)
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

		tx.delete(todoTasks)
			.where(and(eq(todoTasks.id, input.todoId), eq(todoTasks.userId, ctx.userId)))
			.run();
	});

	return { ok: true };
}

/**
 * Put a block back on the list, with no time.
 *
 * The exact reverse of `promoteTodo`, and it exists because the forward move
 * was one-way: a todo dragged onto Tuesday at nine stopped being a todo, and
 * changing your mind meant deleting the block and typing it in again. The week
 * is a plan, and a plan you cannot back out of is one people stop making.
 *
 * One-off blocks only. A weekly block is a shape of the week rather than a
 * task — dragging one off the grid would quietly delete every future
 * occurrence, which is not what "not today" means. Refused, in words.
 *
 * What survives is what a todo can hold: the name, the notes, the category, the
 * notebook and the three ratings. The date and the hour are what is being
 * given up, and the status comes with it — a block ticked off and then pulled
 * back is still done.
 */
export function demoteToTodo(ctx: Ctx, slotId: number): { ok: true; todoId: number } {
	const slot = db
		.select()
		.from(exceptionalTasks)
		.where(and(eq(exceptionalTasks.id, slotId), eq(exceptionalTasks.userId, ctx.userId)))
		.get();
	if (!slot) throw new NotFoundError('Block');

	// The instance carries what happened to it: the status, and the notes, which
	// a block has nowhere else to put.
	const instance = db
		.select()
		.from(taskRecords)
		.where(and(eq(taskRecords.exceptionalSlotId, slotId), eq(taskRecords.userId, ctx.userId)))
		.get();

	const activity = slot.activityId
		? db.select().from(activities).where(eq(activities.id, slot.activityId)).get()
		: undefined;
	const category = slot.categoryId
		? db.select().from(categories).where(eq(categories.id, slot.categoryId)).get()
		: undefined;
	const workout = slot.workoutId
		? db.select().from(workouts).where(eq(workouts.id, slot.workoutId)).get()
		: undefined;

	// A block need not be named — it can be "the health one at seven" — but a
	// todo on a list with no title is a blank row nobody can act on.
	const title =
		slot.label?.trim() || activity?.name || workout?.title || category?.name || 'Untitled';

	const todoId = db.transaction((tx) => {
		const row = tx
			.insert(todoTasks)
			.values({
				...stamps(ctx),
				userId: ctx.userId,
				title,
				notes: instance?.notes ?? '',
				status: instance?.status ?? 'todo',
				scheduledDate: null,
				sortOrder: nextSortOrder(ctx),
				categoryId: slot.categoryId,
				notebookId: slot.notebookId,
				urgency: slot.urgency,
				interest: slot.interest,
				energy: slot.energy
			})
			.returning({ id: todoTasks.id })
			.get();

		tx.delete(taskRecords)
			.where(and(eq(taskRecords.exceptionalSlotId, slotId), eq(taskRecords.userId, ctx.userId)))
			.run();
		tx.delete(exceptionalTasks)
			.where(and(eq(exceptionalTasks.id, slotId), eq(exceptionalTasks.userId, ctx.userId)))
			.run();

		return row.id;
	});

	return { ok: true, todoId };
}

// --- Mutations ----------------------------------------------------------------

export const MAX_TITLE_LENGTH = 300;
export const MAX_NOTES_LENGTH = 4000;
export const MAX_LABEL_LENGTH = 300;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TodoInput = {
	title: unknown;
	notes?: unknown;
	categoryId?: unknown;
	notebookId?: unknown;
	scheduledDate?: unknown;
	status?: unknown;
	ratings?: Partial<RatingValues>;
	/**
	 * Labels, as typed: "a1, done" or "#a1 #done". Left out means leave alone
	 * on an update, which matters because not every screen that edits a todo
	 * offers the field — a form with no tags box must not strip the tags an
	 * assistant put on.
	 */
	tags?: unknown;
};

export function createTodo(ctx: Ctx, raw: TodoInput): number {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	const result = db
		.insert(todoTasks)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			title,
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			categoryId: ownedCategoryId(ctx, raw.categoryId),
			notebookId: ownedNotebookId(ctx, raw.notebookId),
			scheduledDate: optionalDate(raw.scheduledDate),
			status: isStatus(raw.status) ? raw.status : 'todo',
			sortOrder: nextSortOrder(ctx),
			...(raw.ratings ?? {})
		})
		.run();

	const id = Number(result.lastInsertRowid);
	if (raw.tags !== undefined)
		replaceTodoTags(id, parseTags(optionalTagInput(raw.tags)), ctx.userId);
	host.emit(ctx, 'todo.created', { id, title });
	return id;
}

export function updateTodo(ctx: Ctx, id: number, raw: TodoInput): void {
	const res = db
		.update(todoTasks)
		.set({
			title: str(raw.title, 'title', { max: MAX_TITLE_LENGTH }),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			categoryId: ownedCategoryId(ctx, raw.categoryId),
			notebookId: ownedNotebookId(ctx, raw.notebookId),
			...(raw.ratings ?? {}),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');

	// Only when the caller said something about them. `undefined` is "not my
	// business", not "none" — the board's inline editor has no tags box.
	if (raw.tags !== undefined) {
		replaceTodoTags(id, parseTags(optionalTagInput(raw.tags)), ctx.userId);
		// A word nothing points at any more is not part of the vocabulary.
		cleanupOrphanTags(ctx.userId);
	}
}

export function setTodoStatus(ctx: Ctx, id: number, status: unknown): void {
	if (!isStatus(status)) throw new ValidationError('Invalid status');

	const res = db
		.update(todoTasks)
		.set({
			status,
			// `completed` is kept in step for anything still reading it, and so
			// existing data stays meaningful either way round.
			completed: status === 'done',
			/*
			 * And when it happened, so a list can be ordered by what was just
			 * finished. Cleared on the way back out: something reopened is not
			 * recently done, it is not done.
			 */
			completedAt: status === 'done' ? stamp(ctx) : null,
			updatedAt: stamp(ctx)
		})
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
	if (status === 'done') host.emit(ctx, 'todo.completed', { id });
}

/**
 * Pull a todo onto a day, or push it back to the general list.
 *
 * One column changes. Nothing is copied, so there is no second row to keep in
 * sync and no way for the two to disagree.
 */
export function scheduleTodo(ctx: Ctx, id: number, date: unknown): void {
	const res = db
		.update(todoTasks)
		.set({ scheduledDate: optionalDate(date), updatedAt: stamp(ctx) })
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');
}

export function deleteTodo(ctx: Ctx, id: number): void {
	const res = db
		.delete(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('todo');

	// The join rows went with it (`on delete cascade`); the words they pointed
	// at have not, and one nothing refers to is no longer in the vocabulary.
	cleanupOrphanTags(ctx.userId);
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
		.select({ title: todoTasks.title, notebookId: todoTasks.notebookId })
		.from(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();

	if (!todo) throw new NotFoundError('todo');

	db.transaction((tx) => {
		tx.insert(exceptionalTasks)
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

		tx.update(todoTasks)
			.set({ completed: true, updatedAt: stamp(ctx) })
			.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
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
			tx.update(todoTasks)
				.set({ sortOrder: index, updatedAt: now })
				.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
				.run();
		});
	});
}

export function setTodoRatings(ctx: Ctx, id: number, ratings: Partial<RatingValues>): void {
	if (Object.keys(ratings).length === 0) return;

	const res = db
		.update(todoTasks)
		.set({ ...ratings, updatedAt: stamp(ctx) })
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
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
			exceptionalSlotId: taskRecords.exceptionalSlotId,
			status: taskRecords.status,
			notes: taskRecords.notes,
			urgencyOverride: taskRecords.urgencyOverride,
			interestOverride: taskRecords.interestOverride,
			energyOverride: taskRecords.energyOverride,
			label: exceptionalTasks.label,
			categoryId: exceptionalTasks.categoryId,
			urgency: exceptionalTasks.urgency,
			interest: exceptionalTasks.interest,
			energy: exceptionalTasks.energy
		})
		.from(taskRecords)
		.innerJoin(exceptionalTasks, eq(taskRecords.exceptionalSlotId, exceptionalTasks.id))
		.where(and(eq(taskRecords.id, instanceId), eq(taskRecords.userId, ctx.userId)))
		.get();

	if (!instance) throw new ValidationError('Only one-off blocks can go back to the todo list');

	const sortOrder = nextSortOrder(ctx);

	db.transaction((tx) => {
		tx.insert(todoTasks)
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
		tx.delete(exceptionalTasks)
			.where(
				and(
					eq(exceptionalTasks.id, instance.exceptionalSlotId!),
					eq(exceptionalTasks.userId, ctx.userId)
				)
			)
			.run();
	});
}
