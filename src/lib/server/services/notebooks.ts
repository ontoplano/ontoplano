import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { diaryEntries, exceptionalSlots, goals, notebooks, plannerTodos } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';

/**
 * Notebooks: a subject you write against, with no deadline.
 *
 * A goal is a commitment with a horizon and a verdict at the end. A notebook is
 * neither — it is a place to put things about one subject, so it owns nothing.
 * Entries, todos and goals point at it and are perfectly fine without it;
 * deleting a notebook leaves every one of them where it is. That is the whole
 * design, and the reason this is not a second task system.
 */

export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;

export type Notebook = {
	id: number;
	title: string;
	description: string;
	closedAt: string | null;
	entries: number;
	tasks: number;
	goals: number;
};

type Tally = { entries: number; tasks: number; goals: number };

const NOTHING: Tally = { entries: 0, tasks: 0, goals: 0 };

/**
 * How much is in each notebook.
 *
 * Four grouped counts merged here rather than four correlated subqueries: the
 * house rule is no raw SQL (I11), and the first version of this proved why —
 * drizzle renders a bare column name inside a `sql` template, so the
 * correlation silently compared the wrong two columns and every notebook
 * reported the same tally.
 */
function tallies(ctx: Ctx): Map<number, Tally> {
	const totals = new Map<number, Tally>();

	const add = (id: number | null, key: keyof Tally, n: number) => {
		if (id === null) return;
		const tally = totals.get(id) ?? { ...NOTHING };
		tally[key] += n;
		totals.set(id, tally);
	};

	for (const row of db
		.select({ id: diaryEntries.notebookId, n: count() })
		.from(diaryEntries)
		.where(eq(diaryEntries.userId, ctx.userId))
		.groupBy(diaryEntries.notebookId)
		.all())
		add(row.id, 'entries', row.n);

	// A todo and a block are the same task at two stages, so they share a count.
	for (const row of db
		.select({ id: plannerTodos.notebookId, n: count() })
		.from(plannerTodos)
		.where(eq(plannerTodos.userId, ctx.userId))
		.groupBy(plannerTodos.notebookId)
		.all())
		add(row.id, 'tasks', row.n);

	for (const row of db
		.select({ id: exceptionalSlots.notebookId, n: count() })
		.from(exceptionalSlots)
		.where(eq(exceptionalSlots.userId, ctx.userId))
		.groupBy(exceptionalSlots.notebookId)
		.all())
		add(row.id, 'tasks', row.n);

	for (const row of db
		.select({ id: goals.notebookId, n: count() })
		.from(goals)
		.where(eq(goals.userId, ctx.userId))
		.groupBy(goals.notebookId)
		.all())
		add(row.id, 'goals', row.n);

	return totals;
}

/** Open ones first: a closed notebook is history, not a place you are writing. */
export function listNotebooks(ctx: Ctx): Notebook[] {
	const totals = tallies(ctx);

	return db
		.select({
			id: notebooks.id,
			title: notebooks.title,
			description: notebooks.description,
			closedAt: notebooks.closedAt
		})
		.from(notebooks)
		.where(eq(notebooks.userId, ctx.userId))
		.orderBy(notebooks.closedAt, notebooks.title)
		.all()
		.map((n) => ({ ...n, description: n.description ?? '', ...(totals.get(n.id) ?? NOTHING) }));
}

/**
 * Notes whose notebook was deleted.
 *
 * They have a notebook number and no notebook, which is exactly what being
 * orphaned means, so no extra column records it. The page shows them as a
 * notebook of their own, and only when there are any.
 */
export function listOrphanedNotes(ctx: Ctx) {
	return db
		.select({
			id: diaryEntries.id,
			seq: diaryEntries.seq,
			content: diaryEntries.content,
			forDate: diaryEntries.forDate,
			createdAt: diaryEntries.createdAt
		})
		.from(diaryEntries)
		.where(
			and(
				eq(diaryEntries.userId, ctx.userId),
				isNull(diaryEntries.notebookId),
				isNotNull(diaryEntries.notebookSeq)
			)
		)
		.orderBy(desc(diaryEntries.createdAt))
		.all();
}

export function getNotebook(ctx: Ctx, id: number): Notebook {
	const found = db
		.select({
			id: notebooks.id,
			title: notebooks.title,
			description: notebooks.description,
			closedAt: notebooks.closedAt
		})
		.from(notebooks)
		.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
		.get();

	if (!found) throw new NotFoundError('notebook');

	return {
		...found,
		description: found.description ?? '',
		...(tallies(ctx).get(id) ?? NOTHING)
	};
}

/** Everything pointed at this notebook, in the three shapes it can arrive in. */
export function contentsOf(ctx: Ctx, id: number) {
	assertOwned(ctx, id);

	return {
		entries: db
			.select({
				id: diaryEntries.id,
				// The notebook's own numbering; `seq` counts the whole account and
				// means nothing to somebody reading one notebook.
				seq: diaryEntries.notebookSeq,
				content: diaryEntries.content,
				forDate: diaryEntries.forDate,
				createdAt: diaryEntries.createdAt
			})
			.from(diaryEntries)
			.where(and(eq(diaryEntries.notebookId, id), eq(diaryEntries.userId, ctx.userId)))
			.orderBy(desc(diaryEntries.createdAt))
			.all(),

		todos: db
			.select({
				id: plannerTodos.id,
				title: plannerTodos.title,
				status: plannerTodos.status,
				scheduledDate: plannerTodos.scheduledDate
			})
			.from(plannerTodos)
			.where(and(eq(plannerTodos.notebookId, id), eq(plannerTodos.userId, ctx.userId)))
			.orderBy(plannerTodos.status, plannerTodos.sortOrder)
			.all(),

		blocks: db
			.select({
				id: exceptionalSlots.id,
				label: exceptionalSlots.label,
				date: exceptionalSlots.date,
				startTime: exceptionalSlots.startTime
			})
			.from(exceptionalSlots)
			.where(and(eq(exceptionalSlots.notebookId, id), eq(exceptionalSlots.userId, ctx.userId)))
			.orderBy(desc(exceptionalSlots.date))
			.all(),

		goals: db
			.select({
				id: goals.id,
				title: goals.title,
				horizon: goals.horizon,
				periodStart: goals.periodStart,
				status: goals.status
			})
			.from(goals)
			.where(and(eq(goals.notebookId, id), eq(goals.userId, ctx.userId)))
			.orderBy(desc(goals.periodStart))
			.all()
	};
}

export function createNotebook(ctx: Ctx, raw: { title: unknown; description?: unknown }): number {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	if (notebookTitled(ctx, title)) throw new ConflictError('A notebook by that name already exists');

	const result = db
		.insert(notebooks)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			title,
			description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH })
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updateNotebook(
	ctx: Ctx,
	id: number,
	raw: { title: unknown; description?: unknown }
): void {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });

	const clash = notebookTitled(ctx, title);
	if (clash && clash.id !== id) throw new ConflictError('A notebook by that name already exists');

	const res = db
		.update(notebooks)
		.set({
			title,
			description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH }),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('notebook');
}

/** Close a finished subject, or reopen one you went back to. */
export function setNotebookClosed(ctx: Ctx, id: number, closed: boolean): void {
	const res = db
		.update(notebooks)
		.set({ closedAt: closed ? stamp(ctx) : null, updatedAt: stamp(ctx) })
		.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('notebook');
}

/**
 * Deleting a notebook deletes only the notebook.
 *
 * The links are cut here rather than left to the foreign key: the columns were
 * added by `ALTER TABLE`, which SQLite gives no delete action, so an unlinked
 * delete would simply fail. Cutting them explicitly also says what should
 * happen — the entries and tasks survive, they just stop belonging anywhere.
 *
 * `notebookSeq` is deliberately left behind. An entry with a notebook number
 * and no notebook is one whose notebook was deleted, and that is what puts it
 * in `listOrphanedNotes` rather than back in the diary — a note about a
 * renovation does not become a journal entry because the renovation is over.
 */
export function deleteNotebook(ctx: Ctx, id: number): void {
	db.transaction((tx) => {
		tx.update(diaryEntries)
			.set({ notebookId: null })
			.where(and(eq(diaryEntries.notebookId, id), eq(diaryEntries.userId, ctx.userId)))
			.run();

		tx.update(plannerTodos)
			.set({ notebookId: null })
			.where(and(eq(plannerTodos.notebookId, id), eq(plannerTodos.userId, ctx.userId)))
			.run();

		tx.update(goals)
			.set({ notebookId: null })
			.where(and(eq(goals.notebookId, id), eq(goals.userId, ctx.userId)))
			.run();

		const res = tx
			.delete(notebooks)
			.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
			.run();

		if (res.changes === 0) throw new NotFoundError('notebook');
	});
}

/**
 * A notebook id from a form, or null.
 *
 * Every service that lets something belong to a notebook goes through here, so
 * "somebody else's notebook" and "no notebook" cannot be confused: an id you do
 * not own is a 404, not a silent null (I3).
 */
export function ownedNotebookId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'notebook', { int: true, min: 1 });
	assertOwned(ctx, id);
	return id;
}

/** The open notebooks, for the selector on every form that can point at one. */
export function pickableNotebooks(ctx: Ctx) {
	return db
		.select({ id: notebooks.id, title: notebooks.title })
		.from(notebooks)
		.where(and(eq(notebooks.userId, ctx.userId), isNull(notebooks.closedAt)))
		.orderBy(notebooks.title)
		.all();
}

function notebookTitled(ctx: Ctx, title: string) {
	return db
		.select({ id: notebooks.id })
		.from(notebooks)
		.where(and(eq(notebooks.userId, ctx.userId), eq(notebooks.title, title)))
		.get();
}

function assertOwned(ctx: Ctx, id: number): void {
	const owned = db
		.select({ id: notebooks.id })
		.from(notebooks)
		.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('notebook');
}
