/**
 * `ifUpdatedAt`: a change that is refused if somebody else got there first.
 *
 * An assistant reads a task, thinks for a while and writes it back — and in
 * between the person may have edited the same task on their phone. Without
 * a check the later write wins silently. With one, a caller that passes the
 * `updatedAt` it read is refused with a `conflict` when the row has moved
 * since, and told the row's current stamp so it can read again and decide.
 *
 * Optional, because most calls are one-shot and have nothing to compare, and
 * offered only where the thing has an `updated_at` column — a check against a
 * stamp nobody keeps would pass every time and promise what it cannot hold.
 * Which tools take it is their schema's business: a change tool offers it by
 * spreading `CONCURRENCY_ARGS` (in `tools.ts`, where the docs build reads
 * its words), and the dispatcher checks it for any tool that does.
 */
import { eq } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '$lib/db/index.js';
import {
	activities,
	bills,
	diaryEntries,
	goals,
	ideas,
	inventoryItems,
	ledgers,
	locations,
	notebooks,
	people,
	recipes,
	recurringTasks,
	todoTasks,
	workoutSessions,
	workouts
} from '$lib/db/schema.js';
import { ConflictError } from '$lib/services/errors.js';
import type { Ref, RefKind } from './refs.js';

type Stamped = SQLiteTable & { id: SQLiteColumn; updatedAt: SQLiteColumn };

/** The kinds whose rows keep an `updated_at`, and the table it is in. */
export const STAMPED_KINDS: Partial<Record<RefKind, Stamped>> = {
	todo: todoTasks,
	goal: goals,
	notebook: notebooks,
	note: diaryEntries,
	idea: ideas,
	person: people,
	activity: activities,
	repeatingBlock: recurringTasks,
	item: inventoryItems,
	recipe: recipes,
	location: locations,
	workout: workouts,
	workoutSession: workoutSessions,
	ledger: ledgers,
	bill: bills
};

/** The reference a tool's `ifUpdatedAt` is about: the one it changes. */
export function stampedRef(refs: readonly Ref[] | undefined): Ref | undefined {
	const about = refs?.find((ref) => ref.subject) ?? refs?.find((ref) => ref.arg === 'id');
	return about && STAMPED_KINDS[about.kind] ? about : undefined;
}

/**
 * The row's `updated_at` as stored, or null.
 *
 * By id alone: this runs after `assertRefs`, which has already found the id
 * among the rows this caller can reach — a notebook shared by family
 * included, which a `user_id` filter here would wrongly miss.
 */
export function stampOf(ref: Ref, args: Record<string, unknown>): string | null {
	const table = STAMPED_KINDS[ref.kind];
	const id = Number(args[ref.arg]);
	if (!table || !Number.isInteger(id)) return null;
	const row = db
		.select({ updatedAt: table.updatedAt })
		.from(table as SQLiteTable)
		.where(eq(table.id, id))
		.get() as { updatedAt: string | null } | undefined;
	return row?.updatedAt ?? null;
}

/** Refuses the call when the row's stamp is not the one the caller read. */
export function assertUnchanged(
	refs: readonly Ref[] | undefined,
	args: Record<string, unknown>
): void {
	const expected = args.ifUpdatedAt;
	if (expected === undefined || expected === null) return;
	const ref = stampedRef(refs);
	if (!ref) return;
	const current = stampOf(ref, args);
	if (current !== expected)
		throw new ConflictError(
			`It changed since ${String(expected)}: it was last changed at ${current ?? 'an unknown time'}. Read it again, then decide.`,
			{ updatedAt: current }
		);
}
