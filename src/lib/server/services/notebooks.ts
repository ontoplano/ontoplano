import { and, inArray, or, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { user } from '../db/auth.schema.js';
import { familyUserIds } from './subscriptions.js';
import { diaryEntries, exceptionalTasks, goals, notebooks, todoTasks } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { tagsForEntries } from './diary.js';
import { peopleForEntries } from './people.js';
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
	/** Whether this account owns it — false for one shared into the family. */
	mine: boolean;
	sharedWithFamily: boolean;
	/** The owner's name, for a notebook that arrived by sharing; null on your own. */
	sharedBy?: string | null;
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
		.select({ id: todoTasks.notebookId, n: count() })
		.from(todoTasks)
		.where(eq(todoTasks.userId, ctx.userId))
		.groupBy(todoTasks.notebookId)
		.all())
		add(row.id, 'tasks', row.n);

	for (const row of db
		.select({ id: exceptionalTasks.notebookId, n: count() })
		.from(exceptionalTasks)
		.where(eq(exceptionalTasks.userId, ctx.userId))
		.groupBy(exceptionalTasks.notebookId)
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

	const others = familyUserIds(ctx.userId).filter((one) => one !== ctx.userId);

	return db
		.select({
			id: notebooks.id,
			title: notebooks.title,
			description: notebooks.description,
			closedAt: notebooks.closedAt,
			sharedWithFamily: notebooks.sharedWithFamily,
			ownerId: notebooks.userId,
			ownerName: user.name
		})
		.from(notebooks)
		.innerJoin(user, eq(notebooks.userId, user.id))
		.where(
			others.length === 0
				? eq(notebooks.userId, ctx.userId)
				: or(
						eq(notebooks.userId, ctx.userId),
						and(inArray(notebooks.userId, others), eq(notebooks.sharedWithFamily, true))
					)!
		)
		.orderBy(notebooks.closedAt, notebooks.title)
		.all()
		.map(({ ownerId, ownerName, ...n }) => ({
			...n,
			description: n.description ?? '',
			mine: ownerId === ctx.userId,
			sharedBy: ownerId === ctx.userId ? null : ownerName,
			...(totals.get(n.id) ?? NOTHING)
		}));
}

/**
 * Notes whose notebook was deleted.
 *
 * They have a notebook number and no notebook, which is exactly what being
 * orphaned means, so no extra column records it. The page shows them as a
 * notebook of their own, and only when there are any.
 */
export function listOrphanedNotes(ctx: Ctx) {
	const rows = db
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

	return withTagsAndPeople(ctx, rows);
}

/**
 * A note is a note wherever it was written.
 *
 * One written in a notebook used to be content and nothing else, while the
 * same note written in the diary carried tags and the people it was about —
 * so the same act produced two different things depending on which screen it
 * was typed into. Both lists go through here.
 */
function withTagsAndPeople<T extends { id: number }>(ctx: Ctx, entries: T[]) {
	const tags = tagsForEntries(
		ctx,
		entries.map((e) => e.id)
	);
	const people = peopleForEntries(
		ctx,
		entries.map((e) => e.id)
	);
	return entries.map((entry) => ({
		...entry,
		tags: tags.get(entry.id) ?? [],
		people: people.get(entry.id) ?? []
	}));
}

export function getNotebook(ctx: Ctx, id: number): Notebook {
	assertReachable(ctx, id);
	const found = db
		.select({
			id: notebooks.id,
			title: notebooks.title,
			description: notebooks.description,
			closedAt: notebooks.closedAt,
			sharedWithFamily: notebooks.sharedWithFamily,
			ownerId: notebooks.userId,
			ownerName: user.name
		})
		.from(notebooks)
		.innerJoin(user, eq(notebooks.userId, user.id))
		.where(eq(notebooks.id, id))
		.get();

	if (!found) throw new NotFoundError('notebook');

	const { ownerId, ownerName, ...rest } = found;
	return {
		...rest,
		description: rest.description ?? '',
		mine: ownerId === ctx.userId,
		sharedBy: ownerId === ctx.userId ? null : ownerName,
		...(tallies(ctx).get(id) ?? NOTHING)
	};
}

/** Everything pointed at this notebook, in the three shapes it can arrive in. */
export function contentsOf(ctx: Ctx, id: number) {
	assertReachable(ctx, id);
	const circle = familyUserIds(ctx.userId);

	return {
		// The entries are the shared half: in a shared notebook everybody on the
		// plan reads everybody's, each carrying its writer's name. Tasks, blocks
		// and goals below stay each person's own — a notebook shares its writing,
		// not each other's planners.
		entries: withTagsAndPeople(
			ctx,
			db
				.select({
					id: diaryEntries.id,
					// The notebook's own numbering; `seq` counts the whole account and
					// means nothing to somebody reading one notebook.
					seq: diaryEntries.notebookSeq,
					content: diaryEntries.content,
					forDate: diaryEntries.forDate,
					createdAt: diaryEntries.createdAt,
					ownerId: diaryEntries.userId,
					authorName: user.name
				})
				.from(diaryEntries)
				.innerJoin(user, eq(diaryEntries.userId, user.id))
				.where(and(eq(diaryEntries.notebookId, id), inArray(diaryEntries.userId, circle)))
				.orderBy(desc(diaryEntries.createdAt))
				.all()
				.map(({ ownerId, authorName, ...entry }) => ({
					...entry,
					mine: ownerId === ctx.userId,
					author: ownerId === ctx.userId ? null : authorName
				}))
		),

		todos: db
			.select({
				id: todoTasks.id,
				title: todoTasks.title,
				status: todoTasks.status,
				scheduledDate: todoTasks.scheduledDate
			})
			.from(todoTasks)
			.where(and(eq(todoTasks.notebookId, id), eq(todoTasks.userId, ctx.userId)))
			.orderBy(todoTasks.status, todoTasks.sortOrder)
			.all(),

		blocks: db
			.select({
				id: exceptionalTasks.id,
				label: exceptionalTasks.label,
				date: exceptionalTasks.date,
				startTime: exceptionalTasks.startTime
			})
			.from(exceptionalTasks)
			.where(and(eq(exceptionalTasks.notebookId, id), eq(exceptionalTasks.userId, ctx.userId)))
			.orderBy(desc(exceptionalTasks.date))
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

		tx.update(todoTasks)
			.set({ notebookId: null })
			.where(and(eq(todoTasks.notebookId, id), eq(todoTasks.userId, ctx.userId)))
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
	// Reachable, not owned: writing an entry into a family member's shared
	// notebook is the point of it being shared. The entry stays the writer's.
	assertReachable(ctx, id);
	return id;
}

/** The open notebooks, for the selector on every form that can point at one. */
export function pickableNotebooks(ctx: Ctx) {
	const others = familyUserIds(ctx.userId).filter((one) => one !== ctx.userId);
	return db
		.select({ id: notebooks.id, title: notebooks.title })
		.from(notebooks)
		.where(
			and(
				others.length === 0
					? eq(notebooks.userId, ctx.userId)
					: or(
							eq(notebooks.userId, ctx.userId),
							and(inArray(notebooks.userId, others), eq(notebooks.sharedWithFamily, true))
						)!,
				isNull(notebooks.closedAt)
			)
		)
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

/*
 * SHARING, AND WHERE IT STOPS
 *
 * A notebook marked shared-with-family can be read by everybody on its
 * owner's plan, and they may write their own entries into it. Rows keep
 * their writers' user_id; managing the notebook itself — rename, close,
 * delete, the share switch — stays the owner's alone, which is why the
 * writers below keep their own userId WHERE and the readers call this.
 */
function assertReachable(ctx: Ctx, id: number): void {
	const others = familyUserIds(ctx.userId).filter((one) => one !== ctx.userId);
	const reachable = db
		.select({ id: notebooks.id })
		.from(notebooks)
		.where(
			and(
				eq(notebooks.id, id),
				others.length === 0
					? eq(notebooks.userId, ctx.userId)
					: or(
							eq(notebooks.userId, ctx.userId),
							and(inArray(notebooks.userId, others), eq(notebooks.sharedWithFamily, true))
						)!
			)
		)
		.get();

	if (!reachable) throw new NotFoundError('notebook');
}

/** Share a notebook with the family, or stop. The owner's switch alone. */
export function setNotebookShared(ctx: Ctx, id: number, shared: boolean): void {
	const res = db
		.update(notebooks)
		.set({ sharedWithFamily: shared })
		.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('notebook');
}
