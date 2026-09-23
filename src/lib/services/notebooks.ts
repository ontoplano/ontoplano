import { and, asc, inArray, or, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '$lib/db/index.js';
import { user } from '$lib/db/auth.schema.js';
import { host } from './host.js';
import {
	bills,
	diaryEntries,
	exceptionalTasks,
	goals,
	habits,
	ideas,
	inventoryItems,
	ledgers,
	notebooks,
	recipes,
	todoTasks,
	workouts
} from '$lib/db/schema.js';
import { listGoals } from './goals.js';
import {
	DEFAULT_MODULES,
	NOTEBOOK_MODULES,
	modulesFor,
	parseModules,
	serializeModules,
	type NotebookModule
} from '../notebook-modules.js';
import type { Ctx } from './ctx.js';
import { tagsForEntries } from './diary.js';
import { peopleForEntries } from './people.js';
import { listTodosIn } from './todos.js';
import { listIdeas } from './ideas.js';
import { listItems } from './inventory.js';
import { listLedgers } from './ledgers.js';
import { listBillsThisPeriod } from './bills.js';
import { listHabits } from './habits.js';
import { listWorkouts } from './workouts.js';
import { listRecipes } from './recipes.js';
import { getHiddenSections } from './settings.js';
import { isHidden } from '../sections.js';
import { ConflictError, NotFoundError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';
import { optionalTagInput, parseTags } from './tags.js';

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
	/** One picture, the way a person has a face. Null until somebody adds one. */
	pictureId: number | null;
	/** What a new note here starts labelled with. Empty when nothing is set. */
	defaultTags: string;
	closedAt: string | null;
	/** Whether this account owns it — false for one shared into the family. */
	mine: boolean;
	sharedWithFamily: boolean;
	/** The owner's name, for a notebook that arrived by sharing; null on your own. */
	sharedBy?: string | null;
	/**
	 * What it holds — see `$lib/notebook-modules`.
	 *
	 * Already narrowed by what this account has put away, so a caller can draw
	 * this list as tabs without asking a second question.
	 */
	modules: NotebookModule[];
	/** How much of each is in it, whether or not that module is switched on. */
	counts: Tally;
	/*
	 * The first three counts, by their old names.
	 *
	 * `counts` is the list now, one entry per module. These stay because the
	 * API and the MCP tools answer with them and something out there is reading
	 * them; they are the same three numbers, not a second source of truth.
	 */
	entries: number;
	tasks: number;
	goals: number;
};

/**
 * How a notebook's name says where it belongs.
 *
 * The same em dash the gallery's albums use, for the same reason: a notebook
 * called `Renovation — Kitchen` is a name and a place at once, so there is no
 * parent column to keep in step and renaming one to `Renovation — Bathroom`
 * moves it, which is what typing that plainly means. One idea in the app
 * rather than two.
 */
export { NOTEBOOK_SEPARATOR } from '../notebook-path.js';
import { NOTEBOOK_SEPARATOR } from '../notebook-path.js';

export type NotebookNode = Notebook & {
	depth: number;
	children: NotebookNode[];
	/** Everything under it, so a folder can say what it holds. */
	totals?: Tally;
};

/** The notebooks as they belong to each other, roots first. */
export function notebookTree(ctx: Ctx): NotebookNode[] {
	const flat = listNotebooks(ctx);
	const nodes = new Map<string, NotebookNode>(
		flat.map((n) => [
			n.title,
			{ ...n, depth: n.title.split(NOTEBOOK_SEPARATOR).length - 1, children: [] }
		])
	);

	const roots: NotebookNode[] = [];
	for (const node of nodes.values()) {
		const parts = node.title.split(NOTEBOOK_SEPARATOR);
		parts.pop();
		// The nearest ancestor that exists: `a — b — c` with no `a — b` hangs
		// off `a` rather than off nothing.
		let parent: NotebookNode | undefined;
		while (parts.length > 0 && !parent) {
			parent = nodes.get(parts.join(NOTEBOOK_SEPARATOR));
			parts.pop();
		}
		if (parent) parent.children.push(node);
		else roots.push(node);
	}

	// What a folder holds is what is under it: a notebook whose writing all
	// lives in its children was reading "0 notes", which is true of the row
	// and false of the thing somebody is looking at.
	const withTotals = (node: NotebookNode): Tally => {
		const totals = node.children.reduce(
			(sum, child) => {
				const under = withTotals(child);
				for (const module of NOTEBOOK_MODULES) sum[module.id] += under[module.id];
				return sum;
			},
			// Its own counts first: a folder holds what is under it AND what is
			// in it, and seeding empty made a notebook with children report zero
			// of its own notes.
			{ ...node.counts }
		);
		node.totals = totals;
		return totals;
	};
	roots.forEach(withTotals);
	return roots;
}

/**
 * A table whose rows can point at a notebook.
 *
 * Every module's table carries the same two columns, so counting them is one
 * function rather than eleven near-identical queries — which is what this was
 * on the way to becoming.
 */
type Scopable = SQLiteTable & { notebookId: SQLiteColumn; userId: SQLiteColumn };

/** One number per module — see `$lib/notebook-modules`. */
export type Tally = Record<NotebookModule, number>;

const NOTHING: Tally = Object.fromEntries(NOTEBOOK_MODULES.map((m) => [m.id, 0])) as Tally;

/**
 * How much is in each notebook.
 *
 * One grouped count per module merged here rather than a correlated subquery
 * each: the house rule is no raw SQL (I11), and the first version of this
 * proved why — drizzle renders a bare column name inside a `sql` template, so
 * the correlation silently compared the wrong two columns and every notebook
 * reported the same tally.
 *
 * Counted whether or not the module is switched on. A notebook that was told
 * to stop showing Inventory still has its items, and the Edit dialog says so
 * beside the switch — a count that vanished with the tab would make turning
 * something off look like deleting it.
 */
function tallies(ctx: Ctx): Map<number, Tally> {
	const totals = new Map<number, Tally>();

	const add = (id: number | null, key: NotebookModule, n: number) => {
		if (id === null) return;
		const tally = totals.get(id) ?? { ...NOTHING };
		tally[key] += n;
		totals.set(id, tally);
	};

	/** Every row of one table, grouped by the notebook it points at. */
	const countBy = (key: NotebookModule, table: Scopable) => {
		for (const r of db
			.select({ id: table.notebookId, n: count() })
			.from(table)
			.where(eq(table.userId, ctx.userId))
			.groupBy(table.notebookId)
			.all())
			add(r.id as number | null, key, r.n);
	};

	countBy('notes', diaryEntries);
	// A todo and a block are the same task at two stages, so they share a count.
	countBy('tasks', todoTasks);
	countBy('tasks', exceptionalTasks);
	countBy('goals', goals);
	countBy('ideas', ideas);
	countBy('inventory', inventoryItems);
	countBy('ledgers', ledgers);
	countBy('bills', bills);
	countBy('habits', habits);
	countBy('workouts', workouts);
	countBy('recipes', recipes);

	return totals;
}

/** Open ones first: a closed notebook is history, not a place you are writing. */
export function listNotebooks(ctx: Ctx): Notebook[] {
	const totals = tallies(ctx);
	// One read for the whole list: which rooms this account has put away is a
	// fact about the account, and asking it once per notebook is one settings
	// lookup per row for an answer that cannot differ between them.
	const hidden = getHiddenSections(ctx.userId);

	const others = host.familyUserIds(ctx.userId).filter((one) => one !== ctx.userId);

	return db
		.select({
			id: notebooks.id,
			title: notebooks.title,
			description: notebooks.description,
			pictureId: notebooks.pictureId,
			defaultTags: notebooks.defaultTags,
			modules: notebooks.modules,
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
		.map(({ ownerId, ownerName, ...n }) =>
			shape(
				{ ...n, mine: ownerId === ctx.userId, sharedBy: ownerId === ctx.userId ? null : ownerName },
				totals,
				hidden
			)
		);
}

/**
 * A row from the table, as the rest of the app wants it.
 *
 * One place so the list and the single-notebook read cannot disagree about
 * what a notebook is — which they did, before this: only one of them narrowed
 * the modules by what the account had put away.
 */
function shape(
	row: {
		id: number;
		title: string;
		description: string | null;
		pictureId: number | null;
		defaultTags: string | null;
		modules: string | null;
		closedAt: string | null;
		sharedWithFamily: boolean;
		mine: boolean;
		sharedBy: string | null;
	},
	totals: Map<number, Tally>,
	/** Read once by the caller: it is one answer about the account, not per row. */
	hidden: readonly string[]
): Notebook {
	const counts = totals.get(row.id) ?? NOTHING;
	return {
		...row,
		description: row.description ?? '',
		defaultTags: row.defaultTags ?? '',
		modules: modulesFor(row.modules, hidden),
		counts,
		entries: counts.notes,
		tasks: counts.tasks,
		goals: counts.goals
	};
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
			title: diaryEntries.title,
			content: diaryEntries.content,
			forDate: diaryEntries.forDate,
			archivedAt: diaryEntries.archivedAt,
			createdAt: diaryEntries.createdAt,
			// What the Edited order reads. Sent for the orphans too, because they
			// are drawn by the same list with the same control above it.
			updatedAt: diaryEntries.updatedAt
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
			pictureId: notebooks.pictureId,
			defaultTags: notebooks.defaultTags,
			modules: notebooks.modules,
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
	return shape(
		{
			...rest,
			mine: ownerId === ctx.userId,
			sharedBy: ownerId === ctx.userId ? null : ownerName
		},
		tallies(ctx),
		getHiddenSections(ctx.userId)
	);
}

/**
 * What the Edit dialog offers: every module, with this notebook's answer.
 *
 * The whole list rather than only what is on, because the dialog's job is
 * switching them, and each row carries how much is already filed under it —
 * the number is what makes turning one off legible as "this tab goes" rather
 * than "this is deleted".
 *
 * A module whose room this account has put away is left out altogether. It
 * would be a switch that changes nothing on screen, and the honest place to
 * answer for it is Preferences, where the room itself was put away.
 */
export function moduleChoices(ctx: Ctx, id: number) {
	const notebook = getNotebook(ctx, id);
	const on = new Set(parseModules(rawModules(ctx, id)));
	const hidden = getHiddenSections(ctx.userId);

	return NOTEBOOK_MODULES.filter((m) => !('hide' in m && m.hide) || !isHidden(hidden, m.hide)).map(
		(m) => ({
			id: m.id,
			name: m.name,
			always: 'always' in m,
			on: on.has(m.id),
			held: notebook.counts[m.id]
		})
	);
}

/** What is stored, before the account's hidden rooms are taken off it. */
function rawModules(ctx: Ctx, id: number): string | null {
	assertReachable(ctx, id);
	return (
		db.select({ modules: notebooks.modules }).from(notebooks).where(eq(notebooks.id, id)).get()
			?.modules ?? null
	);
}

/** Everything pointed at this notebook, in the three shapes it can arrive in. */
export function contentsOf(ctx: Ctx, id: number) {
	assertReachable(ctx, id);
	const circle = host.familyUserIds(ctx.userId);

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
					title: diaryEntries.title,
					content: diaryEntries.content,
					forDate: diaryEntries.forDate,
					archivedAt: diaryEntries.archivedAt,
					pinnedAt: diaryEntries.pinnedAt,
					createdAt: diaryEntries.createdAt,
					updatedAt: diaryEntries.updatedAt,
					ownerId: diaryEntries.userId,
					authorName: user.name
				})
				.from(diaryEntries)
				.innerJoin(user, eq(diaryEntries.userId, user.id))
				.where(and(eq(diaryEntries.notebookId, id), inArray(diaryEntries.userId, circle)))
				/*
				 * Oldest first, which is not what a list of writing usually wants.
				 *
				 * The diary is a log and reads newest first: what happened today is
				 * the thing to see. A notebook is not a log — it is a subject being
				 * worked through, and its notes are read in the order they were
				 * written, the way the pages of a real one are. Newest first put
				 * the end of the renovation above its beginning.
				 *
				 * Above all of it, whatever has been pinned — the measurements, the
				 * account number, the thing the notebook is actually for — with the
				 * most recently pinned leading, which is what pinning another one
				 * means. `pinned_at DESC` puts nulls last in SQLite, so the
				 * unpinned majority keeps the order it always had.
				 */
				.orderBy(desc(diaryEntries.pinnedAt), asc(diaryEntries.createdAt), asc(diaryEntries.id))
				.all()
				.map(({ ownerId, authorName, ...entry }) => ({
					...entry,
					mine: ownerId === ctx.userId,
					author: ownerId === ctx.userId ? null : authorName
				}))
		),

		// The whole todo, not a label and a status: the notebook's Tasks tab
		// operates on these the way the to-do room does, which needs everything
		// a row there shows — the category, the ratings, whether it is put away.
		todos: listTodosIn(ctx, id),

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

		// The whole goal, not a title and a date: the Goals tab draws the same
		// card the goals room does, which needs the measures, the links and the
		// area — see `GoalCard`. Closed ones are included, because a notebook is
		// also the record of what was attempted there.
		goals: listGoals(ctx, { includeClosed: true, notebookId: id }),

		/*
		 * The rest, each through its own room's list function, for exactly the
		 * reason the goals above go through theirs.
		 *
		 * The tab draws these rows with the room's own component, so they have
		 * to be the rows the room would have handed it — the same joins, the
		 * same derived fields, the same order. A second query shaped by hand
		 * here is how two screens start disagreeing about what a row is.
		 *
		 * All of them, whatever the notebook is switched on for. A module can
		 * be turned off with things still filed under it, and the Edit dialog
		 * says how many; the page draws the tabs it was given.
		 */
		ideas: listIdeas(ctx, { notebookId: id }),
		inventory: listItems(ctx, { notebookId: id }),
		ledgers: listLedgers(ctx, { notebookId: id, includeArchived: true }),
		bills: listBillsThisPeriod(ctx, { notebookId: id, includeArchived: true }),
		habits: listHabits(ctx, { notebookId: id }),
		workouts: listWorkouts(ctx, { notebookId: id, includeArchived: true }),
		recipes: listRecipes(ctx, { notebookId: id, includeArchived: true })
	};
}

export function createNotebook(
	ctx: Ctx,
	raw: { title: unknown; description?: unknown; defaultTags?: unknown; modules?: unknown }
): number {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });
	if (notebookTitled(ctx, title)) throw new ConflictError('A notebook by that name already exists');

	const result = db
		.insert(notebooks)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			title,
			description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH }),
			defaultTags: parseTags(optionalTagInput(raw.defaultTags)).join(', '),
			// Written out rather than left null, so a notebook says what it holds
			// from the day it is made and a change to the default later does not
			// silently rearrange notebooks people already have.
			modules: serializeModules(wantedModules(raw.modules) ?? DEFAULT_MODULES)
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updateNotebook(
	ctx: Ctx,
	id: number,
	raw: { title: unknown; description?: unknown; defaultTags?: unknown; modules?: unknown }
): void {
	const title = str(raw.title, 'title', { max: MAX_TITLE_LENGTH });

	const clash = notebookTitled(ctx, title);
	if (clash && clash.id !== id) throw new ConflictError('A notebook by that name already exists');

	const wanted = wantedModules(raw.modules);

	const res = db
		.update(notebooks)
		.set({
			title,
			description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH }),
			// Left out entirely, they stay as they were: this takes the whole
			// form and also one field at a time from an assistant.
			...(raw.defaultTags === undefined
				? {}
				: { defaultTags: parseTags(optionalTagInput(raw.defaultTags)).join(', ') }),
			// The same rule for the modules: renaming a notebook over MCP must
			// not empty its tabs down to the default.
			...(wanted === null ? {} : { modules: keepingHidden(ctx, id, wanted) }),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(notebooks.id, id), eq(notebooks.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('notebook');
}

/**
 * The labels a new note in this notebook should start with.
 *
 * Empty for a note filed nowhere, and empty for a notebook nobody set any on,
 * which is the same answer and wants no distinction. Reads the column rather
 * than the whole notebook: this runs on every note written.
 */
export function defaultTagsOf(ctx: Ctx, notebookId: number | null): string {
	if (notebookId === null) return '';
	const found = db
		.select({ defaultTags: notebooks.defaultTags })
		.from(notebooks)
		.where(eq(notebooks.id, notebookId))
		.get();
	return found?.defaultTags ?? '';
}

/**
 * The modules a caller asked for — a list, a comma-separated string, or nothing.
 *
 * Null means the caller said nothing, which is different from an empty list:
 * an empty list is somebody switching everything off in the dialog, and Notes
 * survives it because `serializeModules` always keeps it.
 */
function wantedModules(raw: unknown): string[] | null {
	if (raw === undefined || raw === null) return null;
	// Split whether it arrived as a list or as one comma-separated string, and
	// whether a list's entries are single ids or lists themselves: a form posts
	// one field per ticked box, an assistant sends a sentence's worth of them,
	// and `FormData.getAll` on a single comma-joined field gives one of each.
	return (Array.isArray(raw) ? raw : [raw])
		.flatMap((one) => String(one).split(','))
		.map((part) => part.trim())
		.filter(Boolean);
}

/**
 * What to store, given what the dialog could not show.
 *
 * The dialog only lists modules whose rooms this account can see, so posting
 * what it shows would switch off anything hidden — put Finance away, rename a
 * notebook, and its Bills tab is gone for good when Finance comes back. So
 * what was already stored for a hidden module is carried over untouched.
 */
function keepingHidden(ctx: Ctx, id: number, wanted: readonly string[]): string {
	const hidden = getHiddenSections(ctx.userId);
	const stored = new Set(parseModules(rawModules(ctx, id)));
	const kept = NOTEBOOK_MODULES.filter(
		(m) => 'hide' in m && m.hide && isHidden(hidden, m.hide) && stored.has(m.id)
	).map((m) => m.id);
	return serializeModules([...wanted, ...kept]);
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

		// Everything else a notebook can hold, cut the same way. The rooms keep
		// their rows; only the pointer at this subject goes.
		for (const table of [ideas, inventoryItems, ledgers, bills, habits, workouts, recipes]) {
			tx.update(table)
				.set({ notebookId: null })
				.where(and(eq(table.notebookId, id), eq(table.userId, ctx.userId)))
				.run();
		}

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

/**
 * `{ notebookId }` when the caller named one, and nothing at all when it did not.
 *
 * Spread into the values a room writes. The distinction matters because these
 * rooms are reached two ways: a form posts every field it has, including an
 * empty notebook meaning "none", while an assistant changing a habit's name
 * over MCP says nothing about the notebook and must not be read as taking the
 * habit out of its subject.
 */
export function notebookPatch(ctx: Ctx, raw: { notebookId?: unknown }) {
	return 'notebookId' in raw ? { notebookId: ownedNotebookId(ctx, raw.notebookId) } : {};
}

/** The open notebooks, for the selector on every form that can point at one. */
export function pickableNotebooks(ctx: Ctx) {
	const others = host.familyUserIds(ctx.userId).filter((one) => one !== ctx.userId);
	return (
		db
			// The labels come along: the note form fills them in when a notebook is
			// picked, which it cannot do by asking the server after every pick.
			.select({ id: notebooks.id, title: notebooks.title, defaultTags: notebooks.defaultTags })
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
			.all()
	);
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
	const others = host.familyUserIds(ctx.userId).filter((one) => one !== ctx.userId);
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
