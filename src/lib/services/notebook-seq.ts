import { and, eq, getTableName, max } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from '$lib/db/index.js';
import type { Ctx } from './ctx.js';
import { getUserSetting, setUserSetting } from './settings.js';
import { notebookPatch } from './notebooks.js';
import type { NotebookModule } from '../notebook-modules.js';

/**
 * Numbers inside a notebook — what `TASK:#4`, `GOAL:#2` and `IDEA:#7` point at.
 *
 * A reference somebody types by hand has to be a number they can see, so a
 * thing filed under a notebook is numbered there: the fourth task about the
 * kitchen is #4 rather than #312. One allocator for every kind that has the
 * column, so they cannot come to disagree about what a number means.
 *
 * The high-water mark rather than `max + 1`: deleting the newest one would
 * hand its number to the next, and a reference written months ago would
 * silently come to mean something else. A reference that can change what it
 * refers to is not a reference.
 *
 * Null for a thing filed under nothing: there is nowhere for it to be fourth of.
 */
export type Numbered = SQLiteTable & {
	id: SQLiteColumn;
	userId: SQLiteColumn;
	notebookId: SQLiteColumn;
	notebookSeq: SQLiteColumn;
};

/**
 * Where each kind remembers a notebook's highest-ever number. Tasks had the
 * key before there was anything else numbered, so theirs keeps its name.
 */
const markPrefix = (name: string) => (name === 'todo_tasks' ? 'todos' : name);

const markKey = (table: Numbered, notebookId: number) =>
	`${markPrefix(getTableName(table))}.seq.highest.${notebookId}`;

/** The next number free in that notebook, taken. */
export function nextNotebookSeq(
	ctx: Ctx,
	table: Numbered,
	notebookId: number | null | undefined
): number | null {
	if (!notebookId) return null;
	const present = Number(
		db
			.select({ value: max(table.notebookSeq) })
			.from(table)
			.where(eq(table.notebookId, notebookId))
			.get()?.value ?? 0
	);
	const everUsed = Number(getUserSetting(ctx.userId, markKey(table, notebookId)) ?? 0);
	const next = Math.max(present, everUsed) + 1;
	setUserSetting(ctx.userId, markKey(table, notebookId), String(next));
	return next;
}

/**
 * The number a row should have once it is filed in `notebookId`.
 *
 * Kept if it already has one there — a thing edited twice must not change its
 * own reference — and otherwise the next one, or none if it leaves: a number
 * in a notebook it is no longer in is a reference to nothing.
 */
export function notebookSeqFor(
	ctx: Ctx,
	table: Numbered,
	id: number,
	notebookId: number | null
): number | null {
	const was = db
		.select({ notebookId: table.notebookId, notebookSeq: table.notebookSeq })
		.from(table)
		.where(and(eq(table.id, id), eq(table.userId, ctx.userId)))
		.get() as { notebookId: number | null; notebookSeq: number | null } | undefined;
	return was && was.notebookId === notebookId && was.notebookSeq !== null
		? was.notebookSeq
		: nextNotebookSeq(ctx, table, notebookId);
}

/**
 * `notebookPatch`, numbered: the notebook a form chose, and the number that
 * goes with it. Left out means left alone, the number included.
 */
export function numberedNotebookPatch(
	ctx: Ctx,
	raw: { notebookId?: unknown },
	holds: NotebookModule,
	table: Numbered,
	id?: number
): { notebookId?: number | null; notebookSeq?: number | null } {
	const patch = notebookPatch(ctx, raw, holds, id === undefined ? undefined : { table, id });
	if (patch.notebookId === undefined) return patch;
	const notebookSeq =
		id === undefined
			? nextNotebookSeq(ctx, table, patch.notebookId)
			: notebookSeqFor(ctx, table, id, patch.notebookId);
	return { ...patch, notebookSeq };
}
