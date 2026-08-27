/**
 * Taking your data out, and closing your account.
 *
 * Both are launch requirements, and both are easy to get subtly wrong: an
 * export that quietly omits a table is worse than none, and a "deletion" that
 * only hides rows is a lie. So both work from one explicit list of every table
 * holding user data, written out by reference rather than looked up by name —
 * adding a table and forgetting it here is then a compile error, not a silent
 * leak.
 */
import { eq, type SQL } from 'drizzle-orm';

import { db } from '../db/index.js';
import { getUserSetting, setUserSetting } from '../settings.js';
import { PLANS } from '../../plans.js';
import { record as audit } from './audit.js';
import { RateLimitedError } from './errors.js';
import { resolvePlan } from './subscriptions.js';
import * as schema from '../db/schema.js';

/**
 * The slice of a connection a removal needs.
 *
 * Deletion runs inside a transaction, and a drizzle transaction is not a `db`
 * — it has no `$client`, so casting one to the other is a lie TypeScript is
 * right to reject. Naming what is actually used says the true thing instead.
 */
type Deleter = Pick<typeof db, 'delete'>;

/**
 * A table holding user data.
 *
 * Every one of them carries its own `user_id` now — the junction tables were
 * the exception, and they stopped being one when ownership moved into the row.
 * There is no second kind of table here any more, which is the point: a build
 * that adds one and forgets it fails the check below.
 */
type OwnedTable = {
	name: string;
	rows: (userId: string) => unknown[];
	remove: (tx: Deleter, userId: string) => void;
};

function owned(name: string, table: never): OwnedTable {
	// Resolved on use rather than captured here: this list is built at module
	// scope, and reading a column off a table that has not finished
	// initialising yields undefined and a query that fails at runtime.
	const col = () => (table as unknown as { userId: never }).userId;
	return {
		name,
		rows: (userId) => db.select().from(table).where(eq(col(), userId)).all(),
		remove: (tx, userId) => void tx.delete(table).where(eq(col(), userId)).run()
	};
}

/**
 * Every table holding user data, ordered so deletion runs children first and
 * foreign keys stay satisfied the whole way down.
 *
 * Junction tables are listed rather than left to cascade: cascade behaviour
 * differs per column here, and a missed one leaves orphans behind. Every one of
 * them carries its own `user_id` now, so an export reads them the same way as
 * anything else instead of collecting ids through their parents.
 */
const USER_TABLES: OwnedTable[] = [
	owned('dailyWins', schema.dailyWins as never),
	owned('quotes', schema.quotes as never),
	owned('goalLinks', schema.goalLinks as never),
	owned('goals', schema.goals as never),
	owned('goalAreas', schema.goalAreas as never),
	owned('dataPoints', schema.dataPoints as never),
	owned('dataStreams', schema.dataStreams as never),
	owned('apiTokens', schema.apiTokens as never),
	owned('ideaTags', schema.ideaTags as never),
	owned('ideas', schema.ideas as never),
	owned('schemeSlots', schema.schemeSlots as never),
	owned('planningSchemes', schema.planningSchemes as never),
	owned('shoppingItems', schema.shoppingItems as never),
	owned('shoppingCategories', schema.shoppingCategories as never),
	owned('plannerTodos', schema.plannerTodos as never),
	owned('diaryEntryTags', schema.diaryEntryTags as never),
	// Mentions first: they point at both entries and people.
	owned('entryPeople', schema.entryPeople as never),
	owned('people', schema.people as never),
	owned('diaryEntries', schema.diaryEntries as never),
	owned('tags', schema.tags as never),
	owned('habitOccurrences', schema.habitOccurrences as never),
	owned('habits', schema.habits as never),
	owned('taskInstances', schema.taskInstances as never),
	owned('suppressedSlots', schema.suppressedSlots as never),
	owned('exceptionalSlots', schema.exceptionalSlots as never),
	owned('auditEvents', schema.auditEvents as never),
	// The provider keeps its own copy of the commercial record; this one is the
	// account's and goes with it.
	owned('subscriptions', schema.subscriptions as never),
	// Last of the subjects: entries, todos, goals and blocks all point at it.
	owned('notebooks', schema.notebooks as never),
	owned('weeklySlots', schema.weeklySlots as never),
	owned('activities', schema.activities as never),
	owned('categories', schema.categories as never),
	owned('userSettings', schema.userSettings as never)
];

/**
 * Tables listed here that have no user_id to scope by.
 *
 * The mistake this catches is silent and expensive: reading a missing column
 * yields undefined, drizzle emits `where  = ?`, and the export or deletion
 * fails at runtime — or worse, a future refactor makes it a no-op and the
 * "deleted" rows quietly survive. Checked at import so it cannot ship.
 */
function misdeclaredTables(): string[] {
	return USER_TABLES.filter((t) => {
		const table = (schema as Record<string, unknown>)[t.name] as Record<string, unknown>;
		return !table || table.userId === undefined;
	}).map((t) => t.name);
}

const misdeclared = misdeclaredTables();
if (misdeclared.length > 0) {
	throw new Error(
		`account.ts lists these, but they have no user_id to scope by: ${misdeclared.join(', ')}`
	);
}

/**
 * Tables carrying a user_id that this module does not handle.
 *
 * A guard rather than documentation: add a table and forget it here, and this
 * returns its name.
 */
export function unaccountedTables(): string[] {
	const known = new Set(USER_TABLES.map((t) => t.name));
	const authOwned = new Set(['user', 'session', 'account', 'verification']);
	return Object.entries(schema)
		.filter(([name, table]) => {
			if (known.has(name) || authOwned.has(name)) return false;
			return !!table && typeof table === 'object' && 'userId' in (table as object);
		})
		.map(([name]) => name);
}

export type AccountExport = {
	exportedAt: string;
	account: { id: string; name: string; email: string };
	data: Record<string, unknown[]>;
};

/**
 * Everything the account owns, as plain JSON.
 *
 * Deliberately the raw rows rather than a prettied-up shape: an export is for
 * being complete and re-importable, not for reading nicely.
 */
/**
 * How many exports are left today, and when the next one unlocks.
 *
 * An export is every row this account owns in one file. Two a day is plenty for
 * a person and mean for anything scraping the endpoint in a loop, which is the
 * only other reason to ask for it repeatedly.
 */
/**
 * How many exports a day.
 *
 * The plan decides; this is the floor a plan cannot go below and what an
 * instance without billing uses.
 */
/**
 * How many exports a day.
 *
 * The plan decides — this is the fallback for an instance that sells nothing,
 * and the number the free plan happens to use.
 */
export const EXPORTS_PER_DAY = 2;

/** How many exports this account's plan allows in a day. */
export function exportsAllowedFor(userId: string, now: Date = new Date()): number {
	const entitlement = resolvePlan(userId, now);
	return PLANS[entitlement.plan].limits.exportsPerDay ?? EXPORTS_PER_DAY;
}
const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPORT_LOG_KEY = 'export.log';

export type ExportAllowance = {
	remaining: number;
	/** When the oldest export in the window falls out of it. Null when unused. */
	nextAt: string | null;
};

function exportLog(userId: string, now: Date): string[] {
	const raw = getUserSetting(userId, EXPORT_LOG_KEY);
	if (!raw) return [];

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((v): v is string => typeof v === 'string')
			.filter((at) => now.getTime() - new Date(at).getTime() < EXPORT_WINDOW_MS)
			.sort();
	} catch {
		return [];
	}
}

/** "in about 7 hours", for a message a person reads once and acts on. */
export function hoursUntil(iso: string | null, now: Date = new Date()): string {
	if (!iso) return 'shortly';
	const ms = new Date(iso).getTime() - now.getTime();
	if (ms <= 0) return 'now';

	const hours = Math.ceil(ms / (60 * 60 * 1000));
	if (hours <= 1) return 'in under an hour';
	return `in about ${hours} hours`;
}

export function exportAllowance(userId: string, now: Date = new Date()): ExportAllowance {
	const log = exportLog(userId, now);
	const remaining = Math.max(0, exportsAllowedFor(userId, now) - log.length);
	const oldest = log[0];

	return {
		remaining,
		nextAt: oldest ? new Date(new Date(oldest).getTime() + EXPORT_WINDOW_MS).toISOString() : null
	};
}

function recordExport(userId: string, now: Date): void {
	const log = [...exportLog(userId, now), now.toISOString()].slice(-exportsAllowedFor(userId, now));
	setUserSetting(userId, EXPORT_LOG_KEY, JSON.stringify(log));
}

export function exportAccount(userId: string, now: Date = new Date()): AccountExport {
	const account = db
		.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.get();

	if (!account) throw new Error('Account not found');

	const allowance = exportAllowance(userId, now);
	if (allowance.remaining <= 0)
		throw new RateLimitedError(
			`You have used both of today's exports. The next one unlocks ${hoursUntil(allowance.nextAt, now)}.`
		);

	recordExport(userId, now);
	audit(userId, 'data_exported');

	const data: Record<string, unknown[]> = {};
	for (const table of USER_TABLES) data[table.name] = table.rows(userId);

	return { exportedAt: now.toISOString(), account, data };
}

/**
 * Delete the account and everything in it.
 *
 * One transaction, so a failure part-way leaves the account intact rather than
 * half-erased. The auth rows go last: while they exist the user can still sign
 * in and retry, which beats being locked out of a shell of an account.
 */
export function deleteAccount(userId: string): void {
	db.transaction((tx) => {
		for (const table of USER_TABLES) table.remove(tx, userId);

		tx.delete(schema.session)
			.where(eq(schema.session.userId, userId) as SQL)
			.run();
		tx.delete(schema.account)
			.where(eq(schema.account.userId, userId) as SQL)
			.run();
		tx.delete(schema.user)
			.where(eq(schema.user.id, userId) as SQL)
			.run();
	});
}

export { USER_TABLES };
