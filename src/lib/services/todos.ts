/**
 * Todos: tasks that have no date yet.
 *
 * A todo and a scheduled block are the same kind of thing at different stages.
 * The difference is `scheduledDate`: null means it lives in the general list,
 * a date means it has been pulled onto that day's board. Setting it is what
 * dragging a card onto Today does — the same row acquires a day rather than
 * being copied into a second table, so nothing has to be kept in sync.
 */
import {
	and,
	asc,
	desc,
	eq,
	exists,
	gte,
	inArray,
	isNotNull,
	isNull,
	lte,
	max,
	not,
	notExists,
	notInArray,
	or,
	sql,
	type SQL
} from 'drizzle-orm';

import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

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
import { UNTAGGED, isTagFiltering, type TagFilter } from '../tag-filter.js';
import {
	RATINGS,
	RATING_ORDER,
	RATING_UNRATED,
	type Rating,
	type RatingValues
} from '../ratings.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { defaultCategoryOf, ownedNotebookId } from './notebooks.js';
import { fileUnderNotebook } from './notebook-linking.js';
import { getUserSetting, setUserSetting } from './settings.js';
import { cleanupOrphanTags, optionalTagInput, parseTags, replaceTodoTags } from './tags.js';
import { created, stamp, stamps } from './time.js';
import { host } from './host.js';
import { TIME_PATTERN, num, oneOf, optionalStr, str } from './validate.js';
import {
	parseAttributes,
	serialiseAttributes,
	withAttribute,
	type TaskAttributes
} from './task-attributes.js';

export type Todo = {
	id: number;
	title: string;
	notes: string;
	status: Status;
	scheduledDate: string | null;
	/**
	 * The day of the block it was delegated to, or null.
	 *
	 * Not a schedule: the task stays in the list and the block is what sits on
	 * that day's board. Read off the block, so it follows a moved block and
	 * clears when the block is deleted.
	 */
	delegatedDate: string | null;
	sortOrder: number;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	notebookId: number | null;
	/** Its number inside that notebook, which is what `TASK:#4` in a note means. */
	notebookSeq: number | null;
	notebookTitle: string | null;
	/** When it was put away, or null. Put away is not the same as finished. */
	archivedAt: string | null;
	/** When it was last finished, or null. Cleared when it is reopened. */
	completedAt: string | null;
	ratings: RatingValues;
	/**
	 * Its attributes, parsed: `{ "url": "…", "room": "B12" }`. The same shape a
	 * task block's are, and carried onto the block when it is put on the plan.
	 */
	attributes: TaskAttributes;
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

export type Tag = {
	id: number;
	name: string;
	/**
	 * When this label went on, or null for one put on before the column
	 * existed. Null rather than a guessed date: "some time before this was
	 * recorded" is the honest answer and a made-up one would be read as real.
	 */
	taggedAt: string | null;
};

const SELECTION = {
	id: todoTasks.id,
	title: todoTasks.title,
	notes: todoTasks.notes,
	status: todoTasks.status,
	completedAt: todoTasks.completedAt,
	scheduledDate: todoTasks.scheduledDate,
	// A subquery rather than a join, so every list that selects this shape
	// gets it without each growing a join of its own.
	delegatedDate: sql<string | null>`(
		SELECT ${exceptionalTasks.date} FROM ${exceptionalTasks}
		WHERE ${exceptionalTasks.id} = ${todoTasks.delegatedSlotId}
			AND ${exceptionalTasks.userId} = ${todoTasks.userId}
	)`,
	sortOrder: todoTasks.sortOrder,
	categoryId: todoTasks.categoryId,
	categoryName: categories.name,
	categoryColor: categories.color,
	notebookId: todoTasks.notebookId,
	notebookSeq: todoTasks.notebookSeq,
	notebookTitle: notebooks.title,
	archivedAt: todoTasks.archivedAt,
	urgency: todoTasks.urgency,
	interest: todoTasks.interest,
	ease: todoTasks.ease,
	attributes: todoTasks.attributes,
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
		delegatedDate: (r.delegatedDate as string) ?? null,
		sortOrder: r.sortOrder as number,
		categoryId: (r.categoryId as number) ?? null,
		categoryName: (r.categoryName as string) ?? null,
		categoryColor: (r.categoryColor as string) ?? null,
		notebookId: (r.notebookId as number) ?? null,
		notebookSeq: (r.notebookSeq as number) ?? null,
		notebookTitle: (r.notebookTitle as string) ?? null,
		archivedAt: (r.archivedAt as string) ?? null,
		completedAt: (r.completedAt as string) ?? null,
		ratings: {
			urgency: (r.urgency as number) ?? null,
			interest: (r.interest as number) ?? null,
			ease: (r.ease as number) ?? null
		},
		attributes: parseAttributes(r.attributes as string | null),
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
		.select({
			todoId: todoTags.todoId,
			id: tags.id,
			name: tags.name,
			taggedAt: todoTags.taggedAt
		})
		.from(todoTags)
		.innerJoin(tags, eq(todoTags.tagId, tags.id))
		.where(and(inArray(todoTags.todoId, todoIds), eq(tags.userId, ctx.userId)))
		.orderBy(tags.name)
		.all();

	for (const row of rows) {
		const held = byTodo.get(row.todoId) ?? [];
		held.push({ id: row.id, name: row.name, taggedAt: row.taggedAt });
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
/** One task, as the list would have shown it. */
export function getTodo(ctx: Ctx, id: number): Todo {
	const row = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();
	if (!row) throw new NotFoundError('todo');
	return withTags(ctx, [shape(row)])[0];
}

/**
 * The SQL for one entry of a tag filter: this todo carries that label, or —
 * for `UNTAGGED` — carries none. Scoped by account on both sides of the join,
 * so a label of somebody else's with the same name answers nothing.
 */
function carries(ctx: Ctx, entry: string): SQL {
	const labels = db
		.select({ one: sql`1` })
		.from(todoTags)
		.innerJoin(tags, eq(todoTags.tagId, tags.id))
		.where(
			and(
				eq(todoTags.todoId, todoTasks.id),
				eq(todoTags.userId, ctx.userId),
				eq(tags.userId, ctx.userId),
				entry === UNTAGGED ? undefined : eq(tags.name, entry)
			)
		);
	return entry === UNTAGGED ? notExists(labels) : exists(labels);
}

/**
 * A tag filter as a `WHERE` clause — see `$lib/tag-filter` for what it means.
 * Undefined when there is nothing to narrow by.
 */
function tagCondition(ctx: Ctx, filter: TagFilter | undefined): SQL | undefined {
	if (!filter || !isTagFiltering(filter)) return undefined;
	const kept = filter.include.map((entry) => carries(ctx, entry));
	const dropped = filter.exclude.map((entry) => carries(ctx, entry));
	return and(
		kept.length === 0 ? undefined : filter.mode === 'all' ? and(...kept) : or(...kept),
		dropped.length === 0 ? undefined : not(or(...dropped)!)
	);
}

/** Every todo, or the ones a tag filter lets through. */
export function listTodos(ctx: Ctx, options: { tags?: TagFilter } = {}): Todo[] {
	const rows = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(and(eq(todoTasks.userId, ctx.userId), tagCondition(ctx, options.tags)))
		.orderBy(asc(todoTasks.sortOrder), asc(todoTasks.createdAt))
		.all()
		.map(shape);
	return withTags(ctx, rows);
}

/**
 * The orders a list of todos can be read in. A closed set: a caller names one
 * of these and never a column, so nothing it sends reaches `ORDER BY`.
 *
 * - `manual` — the drag position, then the older first: the board's order.
 * - `priority` — the order "what should I be doing" is answered in, which is
 *   `compareByPriority` from `$lib/ratings` written as SQL. Urgency, then
 *   ease, then interest, an unset one counting as `RATING_UNRATED`; ties by
 *   the drag position, then the older.
 * - the rest are one column each.
 *
 * Whatever the order, the id comes last, so two rows alike in every key still
 * come out the same way on every page and an offset never repeats or skips.
 */
export const TODO_SORTS = [
	'manual',
	'priority',
	'created',
	'updated',
	'completed',
	'scheduled',
	'title'
] as const;
export type TodoSort = (typeof TODO_SORTS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Which way each order runs when nobody says: the way it is usually read. */
export const TODO_SORT_DEFAULT_DIRECTION: Record<TodoSort, SortDirection> = {
	manual: 'asc',
	// Best first: the higher rating is the one to do.
	priority: 'desc',
	created: 'desc',
	updated: 'desc',
	completed: 'desc',
	scheduled: 'asc',
	title: 'asc'
};

/** Whether dated and undated todos are both wanted, or only one kind. */
export const TODO_SCHEDULED = ['any', 'undated', 'dated'] as const;
export type TodoScheduled = (typeof TODO_SCHEDULED)[number];

/** Whether archived todos are left out, let in, or the only ones. */
export const TODO_ARCHIVED = ['exclude', 'include', 'only'] as const;
export type TodoArchived = (typeof TODO_ARCHIVED)[number];

/** The four states, plus `open` (not finished, not skipped) and `closed`. */
export const TODO_STATES = ['todo', 'doing', 'done', 'skipped', 'open', 'closed'] as const;
export type TodoState = (typeof TODO_STATES)[number];

/** The most rows one page may hold, and the most ids one filter may name. */
export const TODO_PAGE_CEILING = 200;
export const TODO_IDS_CEILING = 200;

export type TodoQuery = {
	/** Only these ids. An id that is not this account's matches nothing. */
	ids?: number[];
	/** Words in the title or the notes, case-insensitively. */
	text?: string;
	/** One notebook; `null` for the ones filed under nothing. */
	notebookId?: number | null;
	state?: TodoState;
	scheduled?: TodoScheduled;
	/** Put on a day from this one, inclusive. Implies a date. */
	scheduledFrom?: string;
	/** Put on a day up to this one, inclusive. Implies a date. */
	scheduledTo?: string;
	createdSince?: string;
	updatedSince?: string;
	completedSince?: string;
	archived?: TodoArchived;
	tags?: TagFilter;
	/** Labelled at or after this instant — by one of `tags.include`, or by any label. */
	taggedSince?: string;
	/** Bounds on a rating, inclusive; an unset rating counts as `RATING_UNRATED`. */
	ratings?: Partial<Record<Rating, { min?: number; max?: number }>>;
	sort?: TodoSort;
	direction?: SortDirection;
	limit: number;
	offset?: number;
};

const RATING_COLUMNS = {
	urgency: todoTasks.urgency,
	ease: todoTasks.ease,
	interest: todoTasks.interest
} as const;

/** A rating as `compareByPriority` weighs it: the value, or the unrated middle. */
const weighed = (rating: Rating) => sql`coalesce(${RATING_COLUMNS[rating]}, ${RATING_UNRATED})`;

/** `LIKE` treats these as wildcards; a caller's words are matched literally. */
const LIKE_ESCAPE = '\\';
const likeLiteral = (said: string) => said.replace(/[\\%_]/g, (c) => `${LIKE_ESCAPE}${c}`);

function queryCondition(ctx: Ctx, query: TodoQuery): SQL | undefined {
	const parts: (SQL | undefined)[] = [eq(todoTasks.userId, ctx.userId)];

	if (query.ids !== undefined) {
		if (query.ids.length > TODO_IDS_CEILING)
			throw new ValidationError(`At most ${TODO_IDS_CEILING} ids at once.`);
		parts.push(query.ids.length === 0 ? sql`0` : inArray(todoTasks.id, query.ids));
	}

	const text = query.text?.trim();
	if (text) {
		const pattern = `%${likeLiteral(text)}%`;
		parts.push(
			or(
				sql`${todoTasks.title} LIKE ${pattern} ESCAPE ${LIKE_ESCAPE}`,
				sql`coalesce(${todoTasks.notes}, '') LIKE ${pattern} ESCAPE ${LIKE_ESCAPE}`
			)
		);
	}

	if (query.notebookId === null) parts.push(isNull(todoTasks.notebookId));
	else if (query.notebookId !== undefined) parts.push(eq(todoTasks.notebookId, query.notebookId));

	const state = query.state;
	if (state === 'open') parts.push(notInArray(todoTasks.status, [...CLOSED_STATUSES]));
	else if (state === 'closed') parts.push(inArray(todoTasks.status, [...CLOSED_STATUSES]));
	else if (state !== undefined) parts.push(eq(todoTasks.status, state));

	const scheduled = query.scheduled ?? 'any';
	if (scheduled === 'undated') parts.push(isNull(todoTasks.scheduledDate));
	if (scheduled === 'dated') parts.push(isNotNull(todoTasks.scheduledDate));
	if (query.scheduledFrom) parts.push(gte(todoTasks.scheduledDate, query.scheduledFrom));
	if (query.scheduledTo) parts.push(lte(todoTasks.scheduledDate, query.scheduledTo));

	if (query.createdSince) parts.push(gte(todoTasks.createdAt, query.createdSince));
	if (query.updatedSince) parts.push(gte(todoTasks.updatedAt, query.updatedSince));
	if (query.completedSince) parts.push(gte(todoTasks.completedAt, query.completedSince));

	const archived = query.archived ?? 'exclude';
	if (archived === 'exclude') parts.push(isNull(todoTasks.archivedAt));
	if (archived === 'only') parts.push(isNotNull(todoTasks.archivedAt));

	parts.push(tagCondition(ctx, query.tags));
	if (query.taggedSince) {
		const named = (query.tags?.include ?? []).filter((one) => one !== UNTAGGED);
		const counting = query.tags && query.tags.include.length > 0;
		parts.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(todoTags)
					.innerJoin(tags, eq(todoTags.tagId, tags.id))
					.where(
						and(
							eq(todoTags.todoId, todoTasks.id),
							eq(todoTags.userId, ctx.userId),
							eq(tags.userId, ctx.userId),
							gte(todoTags.taggedAt, query.taggedSince),
							// Asked about some labels: the date is one of theirs.
							counting ? (named.length > 0 ? inArray(tags.name, named) : sql`0`) : undefined
						)
					)
			)
		);
	}

	for (const rating of RATINGS) {
		const bounds = query.ratings?.[rating];
		if (bounds?.min !== undefined) parts.push(sql`${weighed(rating)} >= ${bounds.min}`);
		if (bounds?.max !== undefined) parts.push(sql`${weighed(rating)} <= ${bounds.max}`);
	}

	return and(...parts);
}

function queryOrder(query: TodoQuery): SQL[] {
	const sort = query.sort ?? 'manual';
	const direction = query.direction ?? TODO_SORT_DEFAULT_DIRECTION[sort];
	const way = (column: SQL | SQLiteColumn) => (direction === 'asc' ? asc(column) : desc(column));
	// Nothing to sort by sits at the end whichever way the rest runs.
	const lastly = (column: SQLiteColumn) => [asc(sql`${column} IS NULL`), way(column)];

	const keys: SQL[] = (() => {
		switch (sort) {
			case 'priority':
				return [
					...RATING_ORDER.map((rating) => way(weighed(rating))),
					asc(todoTasks.sortOrder),
					asc(todoTasks.createdAt)
				];
			case 'created':
				return [way(todoTasks.createdAt)];
			case 'updated':
				return [way(todoTasks.updatedAt)];
			case 'completed':
				return lastly(todoTasks.completedAt);
			case 'scheduled':
				return lastly(todoTasks.scheduledDate);
			case 'title':
				return [way(sql`${todoTasks.title} COLLATE NOCASE`)];
			default:
				return [way(todoTasks.sortOrder), way(todoTasks.createdAt)];
		}
	})();
	return [...keys, asc(todoTasks.id)];
}

/**
 * The one query behind every listing of todos a caller can shape.
 *
 * Filters, order and the page are all SQL: the page is `LIMIT`/`OFFSET` and
 * `total` is a `COUNT` over the same `WHERE`, so a list of thousands costs
 * the rows asked for rather than all of them. Labels are read for the page
 * alone. Everything is scoped to `ctx.userId` in the statement itself.
 */
export function queryTodos(ctx: Ctx, query: TodoQuery): { items: Todo[]; total: number } {
	const where = queryCondition(ctx, query);
	const limit = Math.min(Math.max(1, Math.floor(query.limit)), TODO_PAGE_CEILING);
	const offset = Math.max(0, Math.floor(query.offset ?? 0));

	const total =
		db
			.select({ n: sql<number>`count(*)` })
			.from(todoTasks)
			.where(where)
			.get()?.n ?? 0;

	const rows = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(where)
		.orderBy(...queryOrder(query))
		.limit(limit)
		.offset(offset)
		.all()
		.map(shape);
	return { items: withTags(ctx, rows), total };
}

/**
 * Everything filed under one notebook.
 *
 * The same rows `listTodos` returns, narrowed — the notebook's Tasks tab is
 * the to-do room looking at one subject, so it needs the whole todo rather
 * than a title and a status.
 */
export function listTodosIn(
	ctx: Ctx,
	notebookId: number,
	options: { tags?: TagFilter } = {}
): Todo[] {
	const rows = db
		.select(SELECTION)
		.from(todoTasks)
		.leftJoin(categories, eq(todoTasks.categoryId, categories.id))
		.leftJoin(notebooks, eq(todoTasks.notebookId, notebooks.id))
		.where(
			and(
				eq(todoTasks.notebookId, notebookId),
				eq(todoTasks.userId, ctx.userId),
				tagCondition(ctx, options.tags)
			)
		)
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
 *
 * A task delegated to a block is left out too, while the block exists: its
 * day is decided, and the block is what the board and the plan show for it.
 * The full list (`listTodos`) still has it, with the day on its card.
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
				isNull(todoTasks.delegatedSlotId),
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
): { ok: true; id: number } | { ok: false; message: string } {
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

	const id = db.transaction((tx) => {
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
				ease: todo.ease,
				// And what it says about itself: a task's attributes are a block's.
				attributes: todo.attributes
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
		return slot.id;
	});

	// The one-off it became, so whatever goes on with it can name it.
	return { ok: true, id };
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
 * notebook, the three ratings and the attributes. The date and the hour are what is being
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

	const delegator = delegatedFrom(ctx, slotId);
	if (delegator !== null) {
		dropBlock(ctx, slotId);
		return { ok: true, todoId: delegator };
	}

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
				notebookSeq: nextNotebookSeq(ctx, slot.notebookId),
				urgency: slot.urgency,
				interest: slot.interest,
				ease: slot.ease,
				attributes: slot.attributes
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

/**
 * The task a one-off block was delegated from, when it still exists.
 *
 * That task never left the list, so sending its block back is removing the
 * block — making a second task of it would put the same thing on the list
 * twice.
 */
function delegatedFrom(ctx: Ctx, slotId: number): number | null {
	return (
		db
			.select({ id: todoTasks.id })
			.from(todoTasks)
			.where(and(eq(todoTasks.userId, ctx.userId), eq(todoTasks.delegatedSlotId, slotId)))
			.get()?.id ?? null
	);
}

/** A one-off block gone, its instance by cascade and the task's link by `set null`. */
function dropBlock(ctx: Ctx, slotId: number): void {
	db.delete(exceptionalTasks)
		.where(and(eq(exceptionalTasks.id, slotId), eq(exceptionalTasks.userId, ctx.userId)))
		.run();
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
	 * Its attributes, as an object or already serialised. Left out means leave
	 * alone on an update — a form with no attributes fold must not clear them.
	 */
	attributes?: unknown;
	/**
	 * Labels, as typed: "a1, done" or "#a1 #done". Left out means leave alone
	 * on an update, which matters because not every screen that edits a todo
	 * offers the field — a form with no tags box must not strip the tags an
	 * assistant put on.
	 */
	tags?: unknown;
};

/**
 * This task's number inside the notebook it is filed under.
 *
 * So a note can point at it: `TASK:#4` is the fourth task about the kitchen,
 * which is a number somebody can see on the screen in front of them — the row
 * id is not. The same arrangement notes already have.
 *
 * The high-water mark rather than `max + 1`, and for the same reason a note's
 * is: deleting the newest task would hand its number to the next one, and a
 * reference written in a note months ago would silently come to mean something
 * else. A reference that can change what it refers to is not a reference.
 *
 * Null for a task filed under nothing: there is nowhere for it to be fourth of.
 */
/** Where a notebook's highest-ever task number is remembered. */
const SEQ_MARK_KEY = (notebookId: number) => `todos.seq.highest.${notebookId}`;

function nextNotebookSeq(ctx: Ctx, notebookId: number | null | undefined): number | null {
	if (!notebookId) return null;
	const present =
		db
			.select({ value: max(todoTasks.notebookSeq) })
			.from(todoTasks)
			.where(eq(todoTasks.notebookId, notebookId))
			.get()?.value ?? 0;
	const everUsed = Number(getUserSetting(ctx.userId, SEQ_MARK_KEY(notebookId)) ?? 0);
	const highest = Math.max(present, everUsed);
	setUserSetting(ctx.userId, SEQ_MARK_KEY(notebookId), String(highest + 1));
	return highest + 1;
}

export function createTodo(ctx: Ctx, raw: TodoInput): number {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	const notebookId = ownedNotebookId(ctx, raw.notebookId, 'tasks');
	const result = db
		.insert(todoTasks)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			title,
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			// Unsaid, it is the notebook's — what the form would have filled in.
			// An empty one from a form is somebody choosing none.
			categoryId:
				raw.categoryId === undefined
					? defaultCategoryOf(ctx, notebookId)
					: ownedCategoryId(ctx, raw.categoryId),
			notebookId,
			notebookSeq: nextNotebookSeq(ctx, notebookId),
			scheduledDate: optionalDate(raw.scheduledDate),
			status: isStatus(raw.status) ? raw.status : 'todo',
			sortOrder: nextSortOrder(ctx),
			...(raw.ratings ?? {}),
			attributes: serialiseAttributes(raw.attributes)
		})
		.run();

	const id = Number(result.lastInsertRowid);
	if (raw.tags !== undefined)
		replaceTodoTags(id, parseTags(optionalTagInput(raw.tags)), ctx.userId);
	host.emit(ctx, 'todo.created', { id, title });
	return id;
}

export function updateTodo(ctx: Ctx, id: number, raw: TodoInput): void {
	const notebookId = ownedNotebookId(ctx, raw.notebookId, 'tasks', { table: todoTasks, id });
	/*
	 * A task moved into a notebook is numbered there, once.
	 *
	 * Kept if it already has one for this notebook — a task edited twice must
	 * not change its own reference — and taken away if it leaves, because a
	 * number in a notebook it is no longer in is a reference to nothing.
	 */
	const was = db
		.select({ notebookId: todoTasks.notebookId, notebookSeq: todoTasks.notebookSeq })
		.from(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();
	const seq =
		was && was.notebookId === notebookId && was.notebookSeq !== null
			? was.notebookSeq
			: nextNotebookSeq(ctx, notebookId);

	const res = db
		.update(todoTasks)
		.set({
			title: str(raw.title, 'title', { max: MAX_TITLE_LENGTH }),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			categoryId: ownedCategoryId(ctx, raw.categoryId),
			notebookId,
			notebookSeq: seq,
			...(raw.ratings ?? {}),
			...(raw.attributes === undefined ? {} : { attributes: serialiseAttributes(raw.attributes) }),
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

/**
 * Put labels on a todo, or take them off, without disturbing the rest.
 *
 * `updateTodo` replaces the whole set, which is right for a form that shows
 * every tag it is about to save and wrong for everything else: marking one
 * task `done-by-ai` should not need the caller to read its tags first and
 * write them all back, and a caller that forgets to is a caller that quietly
 * deletes labels somebody else put there.
 *
 * Both lists are optional and both are applied — adding and removing in one
 * call is how "this is not `blocked` any more, it is `done-by-ai`" is said
 * once rather than twice. Removing wins a tie, because a caller that names the
 * same word in both has said something contradictory and the safer reading of
 * it is the one that does not leave a label behind.
 */
export function tagTodo(
	ctx: Ctx,
	id: number,
	change: { add?: unknown; remove?: unknown }
): string[] {
	const owned = db
		.select({ id: todoTasks.id })
		.from(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('todo');

	const add = parseTags(optionalTagInput(change.add));
	const remove = new Set(parseTags(optionalTagInput(change.remove)));

	const now = tagsForTodos(ctx, [id]).get(id) ?? [];
	const wanted = [...new Set([...now.map((one) => one.name), ...add])].filter(
		(name) => !remove.has(name)
	);

	replaceTodoTags(id, wanted, ctx.userId);
	cleanupOrphanTags(ctx.userId);
	// The list ticks over for anything watching the todo rather than its tags.
	db.update(todoTasks)
		.set({ updatedAt: stamp(ctx) })
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();

	return wanted.sort((a, b) => a.localeCompare(b));
}

export function setTodoStatus(ctx: Ctx, id: number, status: unknown): void {
	if (!isStatus(status)) throw new ValidationError({ key: 'errors.todos.invalidStatus' });

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
		/**
		 * How long before it starts to be nudged, or nothing.
		 *
		 * Putting a task on a day is the same act as making a block, and a
		 * block has always been able to ask for a reminder — so the one dialog
		 * that could not was the one people reach for when they think "do this
		 * on Thursday", which is exactly when they want telling.
		 */
		remindLeadMinutes?: unknown;
	}
): void {
	const date = requiredDate(raw.date);
	const startTime = str(raw.startTime, 'time', { max: 5, pattern: TIME_PATTERN });
	const durationMinutes =
		raw.durationMinutes === undefined || raw.durationMinutes === null || raw.durationMinutes === ''
			? 60
			: num(raw.durationMinutes, 'duration', { int: true, min: 1, max: 24 * 60 });
	const mode = oneOf(raw.mode, 'mode', ['category', 'activity'] as const);
	// Nought and nothing are the same answer: no reminder. Stored as null so a
	// block that was never asked and one answered "not at all" read alike.
	const lead =
		raw.remindLeadMinutes === undefined ||
		raw.remindLeadMinutes === null ||
		raw.remindLeadMinutes === '' ||
		Number(raw.remindLeadMinutes) === 0
			? null
			: num(raw.remindLeadMinutes, 'reminder', { int: true, min: 0, max: 24 * 60 });
	const categoryId = ownedCategoryId(ctx, raw.categoryId);
	const activityId = ownedActivityId(ctx, raw.activityId);

	if (mode === 'category' && !categoryId)
		throw new ValidationError({ key: 'errors.todos.categoryRequired' });
	if (mode === 'activity' && !activityId)
		throw new ValidationError({ key: 'errors.todos.activityRequired' });

	const todo = db
		.select({
			title: todoTasks.title,
			notebookId: todoTasks.notebookId,
			attributes: todoTasks.attributes
		})
		.from(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();

	if (!todo) throw new NotFoundError('todo');

	db.transaction((tx) => {
		const block = tx
			.insert(exceptionalTasks)
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
				remindLeadMinutes: lead,
				// As with promoting: giving a task a time must not take it out of
				// the notebook it belongs to.
				notebookId: todo.notebookId,
				attributes: todo.attributes
			})
			.returning({ id: exceptionalTasks.id })
			.get();

		// The task remembers the block rather than taking its date: a
		// `scheduledDate` would put it on that day's board beside the block, and
		// carry it on as overdue after.
		tx.update(todoTasks)
			.set({ completed: true, delegatedSlotId: block.id, updatedAt: stamp(ctx) })
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
	if (ordered.length === 0) throw new ValidationError({ key: 'errors.todos.badOrdering' });

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

/**
 * One attribute on a todo, set or — with an empty value — removed.
 *
 * Its own verb because the ⓘ dialog edits one value in place: sending the
 * whole set back would need the dialog to hold every other pair as it was,
 * and would overwrite one somebody changed in the meantime.
 */
export function setTodoAttribute(ctx: Ctx, id: number, key: unknown, value: unknown): void {
	const row = db
		.select({ attributes: todoTasks.attributes })
		.from(todoTasks)
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.get();
	if (!row) throw new NotFoundError('todo');

	const res = db
		.update(todoTasks)
		.set({ attributes: withAttribute(row.attributes, key, value), updatedAt: stamp(ctx) })
		.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('todo');
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
			easeOverride: taskRecords.easeOverride,
			label: exceptionalTasks.label,
			categoryId: exceptionalTasks.categoryId,
			notebookId: exceptionalTasks.notebookId,
			attributes: exceptionalTasks.attributes,
			urgency: exceptionalTasks.urgency,
			interest: exceptionalTasks.interest,
			ease: exceptionalTasks.ease
		})
		.from(taskRecords)
		.innerJoin(exceptionalTasks, eq(taskRecords.exceptionalSlotId, exceptionalTasks.id))
		.where(and(eq(taskRecords.id, instanceId), eq(taskRecords.userId, ctx.userId)))
		.get();

	if (!instance) throw new ValidationError({ key: 'errors.todos.onlyOneOffBlocksCan' });

	if (delegatedFrom(ctx, instance.exceptionalSlotId!) !== null) {
		dropBlock(ctx, instance.exceptionalSlotId!);
		return;
	}

	const sortOrder = nextSortOrder(ctx);

	db.transaction((tx) => {
		tx.insert(todoTasks)
			.values({
				...stamps(ctx),
				userId: ctx.userId,
				title: instance.label || 'Untitled',
				notes: instance.notes ?? '',
				categoryId: instance.categoryId,
				// The same two `demoteToTodo` keeps: going back to the list does
				// not take it out of its subject or strip what it says about itself.
				notebookId: instance.notebookId,
				notebookSeq: nextNotebookSeq(ctx, instance.notebookId),
				attributes: instance.attributes,
				status: instance.status,
				completed: instance.status === 'done',
				sortOrder,
				urgency: instance.urgencyOverride ?? instance.urgency,
				interest: instance.interestOverride ?? instance.interest,
				ease: instance.easeOverride ?? instance.ease
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

/**
 * What can be done to a handful of tasks at once.
 *
 * The list already does each of these one row at a time, and doing them one
 * row at a time is exactly the problem: labelling nine tasks `#later` is nine
 * presses, nine round trips and nine reorders of the list under your hand.
 * The verbs are the row's own — there is nothing here a single row could not
 * already do — so this adds reach rather than capability.
 */
export const BATCH_VERBS = ['status', 'tag', 'notebook', 'remove'] as const;
export type BatchVerb = (typeof BATCH_VERBS)[number];

export function isBatchVerb(value: unknown): value is BatchVerb {
	return typeof value === 'string' && (BATCH_VERBS as readonly string[]).includes(value);
}

/** How many a single press may touch. A selection, not a migration. */
export const MAX_BATCH = 500;

/**
 * Do one thing to each of these, or do it to none of them.
 *
 * In a transaction on purpose. A batch that half worked is the worst of the
 * three outcomes: the list comes back showing four of nine done and there is
 * no way to tell which four without reading them, and no way to ask for "the
 * rest" except by hand. Whichever row is refused — a notebook that is not
 * this account's, a status that is not a status — takes the whole press with
 * it, and the answer says so.
 *
 * `move` is `fileUnderNotebook`'s job rather than an update: a task moving
 * into a notebook takes the next number free in it, and carrying the old one
 * across collides with whatever already holds it.
 */
export function batchTodos(
	ctx: Ctx,
	verb: BatchVerb,
	rawIds: unknown[],
	what: { status?: unknown; add?: unknown; remove?: unknown; notebookId?: unknown }
): number {
	if (!isBatchVerb(verb)) throw new ValidationError({ key: 'errors.todos.invalidBatch' });
	if (rawIds.length === 0) throw new ValidationError({ key: 'errors.todos.nothingWasChosen' });
	if (rawIds.length > MAX_BATCH)
		throw new ValidationError({ key: 'errors.todos.thatIsTooManyAtOnce' });
	const ids = [...new Set(rawIds.map((id) => num(id, 'id', { int: true, min: 1 })))];
	if (verb === 'notebook' && what.notebookId === undefined)
		throw new ValidationError({ key: 'errors.todos.invalidBatch' });

	db.transaction(() => {
		const notebookId = verb === 'notebook' ? ownedNotebookId(ctx, what.notebookId, 'tasks') : null;
		for (const id of ids) {
			if (verb === 'status') setTodoStatus(ctx, id, what.status);
			else if (verb === 'tag') tagTodo(ctx, id, { add: what.add, remove: what.remove });
			else if (verb === 'remove') deleteTodo(ctx, id);
			else {
				const current = db
					.select({ notebookId: todoTasks.notebookId })
					.from(todoTasks)
					.where(and(eq(todoTasks.id, id), eq(todoTasks.userId, ctx.userId)))
					.get();
				if (!current) throw new NotFoundError('todo');
				if (current.notebookId !== notebookId) fileUnderNotebook(ctx, 'tasks', id, notebookId);
			}
		}
	});
	return ids.length;
}
