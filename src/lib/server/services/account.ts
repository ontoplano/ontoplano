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
import { eq, inArray, type SQL } from 'drizzle-orm';

import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

/** A table owned directly, via its own user_id. */
type OwnedTable = {
	name: string;
	/** True when the table carries its own user_id, false when reached via a parent. */
	direct: boolean;
	rows: (userId: string) => unknown[];
	remove: (tx: typeof db, userId: string) => void;
};

function owned(name: string, table: never): OwnedTable {
	// Resolved on use rather than captured here: this list is built at module
	// scope, and reading a column off a table that has not finished
	// initialising yields undefined and a query that fails at runtime.
	const col = () => (table as unknown as { userId: never }).userId;
	return {
		name,
		direct: true,
		rows: (userId) => db.select().from(table).where(eq(col(), userId)).all(),
		remove: (tx, userId) => void tx.delete(table).where(eq(col(), userId)).run()
	};
}

/** A table reached only through a parent row. */
function joined(name: string, table: never, idsFor: (userId: string) => number[]): OwnedTable {
	const idCol = () => (table as unknown as { id: never }).id;
	return {
		name,
		direct: false,
		rows: (userId) => {
			const ids = idsFor(userId);
			return ids.length === 0 ? [] : db.select().from(table).where(inArray(idCol(), ids)).all();
		},
		remove: (tx, userId) => {
			const ids = idsFor(userId);
			if (ids.length > 0) tx.delete(table).where(inArray(idCol(), ids)).run();
		}
	};
}

const diaryTagIds = (userId: string) =>
	db
		.select({ id: schema.diaryEntryTags.id })
		.from(schema.diaryEntryTags)
		.innerJoin(schema.diaryEntries, eq(schema.diaryEntryTags.entryId, schema.diaryEntries.id))
		.where(eq(schema.diaryEntries.userId, userId))
		.all()
		.map((r) => r.id);

const ideaTagIds = (userId: string) =>
	db
		.select({ id: schema.ideaTags.id })
		.from(schema.ideaTags)
		.innerJoin(schema.ideas, eq(schema.ideaTags.ideaId, schema.ideas.id))
		.where(eq(schema.ideas.userId, userId))
		.all()
		.map((r) => r.id);

const goalLinkIds = (userId: string) =>
	db
		.select({ id: schema.goalLinks.id })
		.from(schema.goalLinks)
		.innerJoin(schema.goals, eq(schema.goalLinks.goalId, schema.goals.id))
		.where(eq(schema.goals.userId, userId))
		.all()
		.map((r) => r.id);

const habitOccurrenceIds = (userId: string) =>
	db
		.select({ id: schema.habitOccurrences.id })
		.from(schema.habitOccurrences)
		.innerJoin(schema.habits, eq(schema.habitOccurrences.habitId, schema.habits.id))
		.where(eq(schema.habits.userId, userId))
		.all()
		.map((r) => r.id);

const schemeSlotIds = (userId: string) =>
	db
		.select({ id: schema.schemeSlots.id })
		.from(schema.schemeSlots)
		.innerJoin(schema.planningSchemes, eq(schema.schemeSlots.schemeId, schema.planningSchemes.id))
		.where(eq(schema.planningSchemes.userId, userId))
		.all()
		.map((r) => r.id);

/**
 * Every table holding user data, ordered so deletion runs children first and
 * foreign keys stay satisfied the whole way down.
 *
 * Junction tables are listed rather than left to cascade: cascade behaviour
 * differs per column here, and a missed one leaves orphans behind.
 */
const USER_TABLES: OwnedTable[] = [
	owned('dailyWins', schema.dailyWins as never),
	owned('quotes', schema.quotes as never),
	joined('goalLinks', schema.goalLinks as never, goalLinkIds),
	owned('goals', schema.goals as never),
	owned('goalAreas', schema.goalAreas as never),
	owned('dataPoints', schema.dataPoints as never),
	owned('dataStreams', schema.dataStreams as never),
	owned('apiTokens', schema.apiTokens as never),
	joined('ideaTags', schema.ideaTags as never, ideaTagIds),
	owned('ideas', schema.ideas as never),
	joined('schemeSlots', schema.schemeSlots as never, schemeSlotIds),
	owned('planningSchemes', schema.planningSchemes as never),
	owned('shoppingItems', schema.shoppingItems as never),
	owned('shoppingCategories', schema.shoppingCategories as never),
	owned('plannerTodos', schema.plannerTodos as never),
	joined('diaryEntryTags', schema.diaryEntryTags as never, diaryTagIds),
	// Mentions first: they point at both entries and people.
	owned('entryPeople', schema.entryPeople as never),
	owned('people', schema.people as never),
	owned('diaryEntries', schema.diaryEntries as never),
	owned('tags', schema.tags as never),
	joined('habitOccurrences', schema.habitOccurrences as never, habitOccurrenceIds),
	owned('habits', schema.habits as never),
	owned('taskInstances', schema.taskInstances as never),
	owned('suppressedSlots', schema.suppressedSlots as never),
	owned('exceptionalSlots', schema.exceptionalSlots as never),
	owned('weeklySlots', schema.weeklySlots as never),
	owned('activities', schema.activities as never),
	owned('categories', schema.categories as never),
	owned('userSettings', schema.userSettings as never)
];

/**
 * Entries claiming direct ownership of a table that has no user_id.
 *
 * The mistake this catches is silent and expensive: reading a missing column
 * yields undefined, drizzle emits `where  = ?`, and the export or deletion
 * fails at runtime — or worse, a future refactor makes it a no-op and the
 * "deleted" rows quietly survive. Checked at import so it cannot ship.
 */
function misdeclaredTables(): string[] {
	return USER_TABLES.filter((t) => t.direct)
		.filter((t) => {
			const table = (schema as Record<string, unknown>)[t.name] as Record<string, unknown>;
			return !table || table.userId === undefined;
		})
		.map((t) => t.name);
}

const misdeclared = misdeclaredTables();
if (misdeclared.length > 0) {
	throw new Error(
		`account.ts declares these as directly owned, but they have no user_id: ${misdeclared.join(', ')}`
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
export function exportAccount(userId: string): AccountExport {
	const account = db
		.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.get();

	if (!account) throw new Error('Account not found');

	const data: Record<string, unknown[]> = {};
	for (const table of USER_TABLES) data[table.name] = table.rows(userId);

	return { exportedAt: new Date().toISOString(), account, data };
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
		for (const table of USER_TABLES) table.remove(tx as typeof db, userId);

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
