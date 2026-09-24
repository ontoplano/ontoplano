import { and, eq, isNull, max, ne, or } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '$lib/db/index.js';
import {
	bills,
	diaryEntries,
	goals,
	habits,
	ideas,
	inventoryItems,
	ledgers,
	recipes,
	todoTasks,
	workouts
} from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError } from './errors.js';
import { num } from './validate.js';
import { assertReachableNotebook } from './notebooks.js';
import { isNotebookModule, type NotebookModule } from '../notebook-modules.js';

/**
 * Putting something that already exists under a subject.
 *
 * Every tab can make a new thing; none of them could take one that was already
 * there. A renovation that starts halfway through a project has its tiles on
 * the shopping list and its account in Finance already, and the only way to
 * gather them was to delete each one and write it again under the notebook.
 *
 * Linking is the same act for all of them — set `notebook_id` — so this is one
 * function rather than nine, and one modal draws all of them. What differs is
 * only which table and which column a row is named by, which is the table
 * below.
 */

/** A module's table, and the column a row is called by on screen. */
type Linkable = {
	table: SQLiteTable & { id: SQLiteColumn; userId: SQLiteColumn; notebookId: SQLiteColumn };
	/** What the row is called — `name` on most, `title` on some, the text itself on an idea. */
	label: SQLiteColumn;
	/** Where to look when that one is empty, as a note's heading usually is. */
	fallback?: SQLiteColumn;
};

/** The first line of a column, which is what a list of these shows. */
const firstLine = (value: unknown): string =>
	String(value ?? '')
		.split('\n')[0]
		.trim();

const TABLES: Partial<Record<NotebookModule, Linkable>> = {
	// A note usually has no heading — the writing is the note — so the picker
	// read a column of empty strings and drew a list of blank rows with a link
	// icon on each. The content's first line is what every other list shows.
	notes: { table: diaryEntries, label: diaryEntries.title, fallback: diaryEntries.content },
	tasks: { table: todoTasks, label: todoTasks.title },
	goals: { table: goals, label: goals.title },
	ideas: { table: ideas, label: ideas.content },
	inventory: { table: inventoryItems, label: inventoryItems.name },
	ledgers: { table: ledgers, label: ledgers.name },
	bills: { table: bills, label: bills.name },
	habits: { table: habits, label: habits.name },
	workouts: { table: workouts, label: workouts.title },
	recipes: { table: recipes, label: recipes.title }
};

/**
 * How many candidates a picker carries.
 *
 * The search runs in the browser over what was loaded, which is right for a
 * personal account's few hundred rows and wrong for a list nobody could scroll
 * anyway. Past this the answer says it was cut, rather than quietly showing a
 * slice — see `linkableInto`.
 */
export const LINKABLE_LIMIT = 300;

export type Linkables = {
	items: { id: number; label: string; elsewhere: boolean }[];
	/** Whether there are more than the picker carries. */
	more: boolean;
};

/**
 * What could be filed under this notebook, that is not already.
 *
 * Both the things filed nowhere and the things filed under another subject: a
 * tin of tomatoes bought for the kitchen is a fair thing to move to the
 * renovation, and refusing that would mean deleting it to re-make it. The ones
 * that are elsewhere say so, so moving one is a choice rather than a surprise.
 */
export function linkableInto(ctx: Ctx, module: string, notebookId: number): Linkables {
	assertReachableNotebook(ctx, notebookId);
	if (!isNotebookModule(module)) throw new NotFoundError('module');
	const linkable = TABLES[module];
	if (!linkable) throw new NotFoundError('module');

	const { table, label, fallback } = linkable;
	const rows = db
		.select({
			id: table.id,
			label,
			fallback: fallback ?? label,
			notebookId: table.notebookId
		})
		.from(table)
		.where(
			and(
				eq(table.userId, ctx.userId),
				or(isNull(table.notebookId), ne(table.notebookId, notebookId))
			)
		)
		.limit(LINKABLE_LIMIT + 1)
		.all();

	return {
		items: rows.slice(0, LINKABLE_LIMIT).map((row) => ({
			id: row.id as number,
			// An idea is its own first line, and so is a note with no heading.
			label: firstLine(row.label) || firstLine(row.fallback),
			elsewhere: row.notebookId !== null
		})),
		more: rows.length > LINKABLE_LIMIT
	};
}

/**
 * File one under this notebook, or take it out.
 *
 * Scoped by the account as well as the id (I1) — never a check followed by an
 * unscoped write. A null notebook is how a thing is unfiled, which is the same
 * act in reverse.
 *
 * ## The number goes with the notebook
 *
 * A note and a task are numbered inside their notebook as well as in the
 * account — `#4` on a card, and what `TASK:#4` in somebody's writing points
 * at — and `(notebook_id, notebook_seq)` is unique. So moving one that already
 * had a number into a notebook that already has that number is a constraint
 * failure, and it is the ordinary case rather than a corner: bringing anything
 * into a notebook with more than three things in it hit it. What came back was
 * "Unexpected error", which is the least useful thing this could have said.
 *
 * The number is therefore not carried. It is dropped on the way out and the
 * next one in the new notebook is taken, which is what the number means: where
 * this sits in that notebook, not where it sat in the last one. `seed-dev.mjs`
 * has the same note beside its own version of this.
 */
export function fileUnderNotebook(
	ctx: Ctx,
	module: string,
	id: unknown,
	notebookId: number | null
): void {
	if (!isNotebookModule(module)) throw new NotFoundError('module');
	const linkable = TABLES[module];
	if (!linkable) throw new NotFoundError('module');
	if (notebookId !== null) assertReachableNotebook(ctx, notebookId);

	const rowId = num(id, 'id', { int: true, min: 1 });
	const { table } = linkable;
	const mine = and(eq(table.id, rowId), eq(table.userId, ctx.userId));

	const res = db
		.update(table)
		.set(
			numbered(table)
				? { notebookId, notebookSeq: nextSeqIn(ctx, table, notebookId) }
				: { notebookId }
		)
		.where(mine)
		.run();

	if (res.changes === 0) throw new NotFoundError(module);
}

/** Whether this table numbers its rows inside their notebook as well. */
function numbered(table: Linkable['table']): table is Linkable['table'] & {
	notebookSeq: SQLiteColumn;
} {
	return 'notebookSeq' in table;
}

/**
 * The next number free in that notebook — or nothing, for a thing being
 * unfiled, which has no notebook to be numbered inside.
 */
function nextSeqIn(
	ctx: Ctx,
	table: Linkable['table'] & { notebookSeq: SQLiteColumn },
	notebookId: number | null
): number | null {
	if (notebookId === null) return null;
	const highest = db
		.select({ seq: max(table.notebookSeq) })
		.from(table)
		.where(and(eq(table.userId, ctx.userId), eq(table.notebookId, notebookId)))
		.get();
	return Number(highest?.seq ?? 0) + 1;
}
