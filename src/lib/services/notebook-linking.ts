import { and, eq, isNull, ne, or } from 'drizzle-orm';
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
};

const TABLES: Partial<Record<NotebookModule, Linkable>> = {
	notes: { table: diaryEntries, label: diaryEntries.title },
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

	const { table, label } = linkable;
	const rows = db
		.select({ id: table.id, label, notebookId: table.notebookId })
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
			// An idea is its own first line, the way a note with no heading is.
			label: String(row.label ?? '').split('\n')[0] || String(row.label ?? ''),
			elsewhere: row.notebookId !== null
		})),
		more: rows.length > LINKABLE_LIMIT
	};
}

/**
 * File one under this notebook, or take it out.
 *
 * One statement, scoped by the account as well as the id (I1) — never a check
 * followed by an unscoped write. A null notebook is how a thing is unfiled,
 * which is the same act in reverse.
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
	const res = db
		.update(linkable.table)
		.set({ notebookId })
		.where(and(eq(linkable.table.id, rowId), eq(linkable.table.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError(module);
}
