/**
 * The account's data, table by table.
 *
 * One explicit list of every table holding user data, written out by reference
 * rather than looked up by name — adding a table and forgetting it here is then
 * a compile error, not a silent leak. Taking an account out, and destroying
 * one, both walk it.
 *
 * Here rather than under `$lib/server` because it is data and not deployment:
 * an instance that is a phone exports, imports and deletes exactly as a server
 * does, over its own database, and this is the half of the old
 * `server/services/account.ts` that never needed a server. What stayed behind
 * is the policy around it — how many exports a plan allows in a day, and the
 * audit line each one writes.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import * as schema from '$lib/db/schema.js';

/**
 * The slice of a connection a removal needs.
 *
 * Deletion runs inside a transaction, and a drizzle transaction is not a `db`
 * — naming what is actually used says the true thing rather than claiming the
 * whole handle and being right to reject most of it.
 */
type Deleter = Pick<typeof db, 'delete'>;

/** What wrote a file, so it says so rather than leaving somebody to guess. */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/**
 * A table holding user data.
 *
 * Every one of them carries its own `user_id` now — the junction tables were
 * the exception, and they stopped being one when ownership moved into the row.
 * There is no second kind of table here any more, which is the point: a build
 * that adds one and forgets it fails the check below.
 */
export type OwnedTable = {
	name: string;
	/** The drizzle table itself, so an importer can insert into it. */
	table: never;
	rows: (userId: string) => unknown[];
	remove: (tx: Deleter, userId: string) => void;
};

/**
 * A row, as something JSON can hold.
 *
 * One column in this schema is a blob — a picture's bytes — and `JSON.stringify`
 * turns a Buffer into `{"type":"Buffer","data":[…]}`, which is both enormous and
 * not something the import can put back. Base64 instead: bigger than the bytes
 * by a third, and a string, which is what every other value in the file is.
 *
 * The export stays a plain JSON file somebody can read, and the import knows
 * which columns to decode because it reads the schema. See `account-import.ts`.
 */
function asJson(row: Record<string, unknown>): Record<string, unknown> {
	let copy: Record<string, unknown> | null = null;
	for (const [key, value] of Object.entries(row)) {
		if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) continue;
		copy ??= { ...row };
		copy[key] = Buffer.from(value).toString('base64');
	}
	return copy ?? row;
}

function owned(name: string, table: never): OwnedTable {
	// Resolved on use rather than captured here: this list is built at module
	// scope, and reading a column off a table that has not finished
	// initialising yields undefined and a query that fails at runtime.
	const col = () => (table as unknown as { userId: never }).userId;
	return {
		name,
		table,
		rows: (userId) => db.select().from(table).where(eq(col(), userId)).all().map(asJson),
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
export const USER_TABLES: OwnedTable[] = [
	// Ordered so a table that points at another comes first.
	//
	// These seven were carrying a user_id and being handled by neither the
	// export nor the deletion — found by asserting `unaccountedTables()` for
	// the first time. Recipes and the written reviews are the ones that matter:
	// the terms promise you can take your data with you, and those are as much
	// somebody's writing as the diary is.
	// Pictures: the join first, then the recipes, then the bytes. A recipe's
	// gallery row points at both of the others, and `media` is last because
	// deleting it while a row still names it is the one order that fails.
	// The gallery's joins point at albums, media and tags, so they go first;
	// the albums follow, and `media` keeps its place further down as the last
	// thing pictures point at.
	owned('albumMedia', schema.albumMedia as never),
	owned('mediaTags', schema.mediaTags as never),
	owned('albums', schema.albums as never),
	owned('recipeImages', schema.recipeImages as never),
	owned('recipeItems', schema.recipeItems as never),
	owned('recipes', schema.recipes as never),
	// Workouts point at their categories, so they go first — the foreign key
	// is SET NULL, but the deletion order should not need it to be. The
	// register goes before the workouts for the same reason: a measure names
	// its session and a session names its workout.
	owned('workoutMeasures', schema.workoutMeasures as never),
	owned('workoutSessions', schema.workoutSessions as never),
	owned('workoutPlanMeasures', schema.workoutPlanMeasures as never),
	owned('workouts', schema.workouts as never),
	owned('workoutCategories', schema.workoutCategories as never),
	owned('pricePoints', schema.pricePoints as never),
	owned('weeklyReviews', schema.weeklyReviews as never),
	// Reminders, then what they point at: a `reminder_sounds` row names a
	// ringtone, and the shared list also drives the delete order, so the
	// pointers go before the thing pointed at.
	owned('reminders', schema.reminders as never),
	owned('reminderSounds', schema.reminderSounds as never),
	owned('ringtones', schema.ringtones as never),
	owned('pushSubscriptions', schema.pushSubscriptions as never),
	owned('calendarFeeds', schema.calendarFeeds as never),
	owned('pluginManifests', schema.pluginManifests as never),
	owned('dailyWins', schema.dailyWins as never),
	owned('quotes', schema.quotes as never),
	// Bills and their payments: the payments point at the bills, so they come
	// first (export any order, but the shared list also drives delete order).
	owned('billPayments', schema.billPayments as never),
	owned('bills', schema.bills as never),
	// The statements point at their ledger, so they go first; the rules that
	// sort them point at nothing but the account itself.
	owned('financeTransactions', schema.financeTransactions as never),
	owned('ledgers', schema.ledgers as never),
	owned('financeRules', schema.financeRules as never),
	owned('goalLinks', schema.goalLinks as never),
	owned('goalTargets', schema.goalTargets as never),
	owned('goals', schema.goals as never),
	owned('goalAreas', schema.goalAreas as never),
	owned('dataPoints', schema.dataPoints as never),
	owned('dataStreams', schema.dataStreams as never),
	owned('apiTokens', schema.apiTokens as never),
	owned('webhookSubscriptions', schema.webhookSubscriptions as never),
	owned('ideaTags', schema.ideaTags as never),
	owned('ideas', schema.ideas as never),
	owned('schemeSlots', schema.schemeSlots as never),
	owned('planningSchemes', schema.planningSchemes as never),
	// Before the items, so a restore has the colours in place — they name
	// attributes by the words rather than by an id, so neither depends on the
	// other's rows, but the order the tables are listed in is the order they
	// are written and this reads with the rest of the inventory.
	owned('inventoryAttributeColors', schema.inventoryAttributeColors as never),
	owned('inventoryItems', schema.inventoryItems as never),
	owned('inventoryCategories', schema.inventoryCategories as never),
	owned('locations', schema.locations as never),
	// Before the tasks, the way `ideaTags` sits before `ideas`: the join goes
	// out first and comes back in after the rows it points at.
	owned('todoTags', schema.todoTags as never),
	owned('todoTasks', schema.todoTasks as never),
	owned('diaryEntryTags', schema.diaryEntryTags as never),
	// Mentions first: they point at both entries and people.
	owned('entryPeople', schema.entryPeople as never),
	owned('people', schema.people as never),
	owned('diaryEntries', schema.diaryEntries as never),
	owned('tags', schema.tags as never),
	owned('habitOccurrences', schema.habitOccurrences as never),
	owned('habits', schema.habits as never),
	owned('taskRecords', schema.taskRecords as never),
	owned('suppressedSlots', schema.suppressedSlots as never),
	// The join before the rows it points at, as with `todoTags`.
	owned('exceptionalTaskTags', schema.exceptionalTaskTags as never),
	owned('exceptionalTasks', schema.exceptionalTasks as never),
	owned('auditEvents', schema.auditEvents as never),
	// What the assistants did, before/after included — as much the account's
	// record as the audit log above it, and it names things the diary names.
	owned('assistantCalls', schema.assistantCalls as never),
	// The provider keeps its own copy of the commercial record; this one is the
	// account's and goes with it.
	owned('subscriptions', schema.subscriptions as never),
	// A record of the payment windows this account opened, so a payment the
	// provider never reported can still be found. It goes with the account for
	// the same reason the subscription does: it is the paper trail for money
	// they spent, and deleting the account must not leave it behind.
	owned('billingCheckouts', schema.billingCheckouts as never),
	// What the app has told this account. Nothing points at it, so it can sit
	// anywhere — here, beside the other things that are a record rather than a
	// subject. It leaves with the export because it is a record of what was
	// said to somebody, and it goes with the deletion because there is nobody
	// left for it to have been said to.
	owned('sentNotifications', schema.sentNotifications as never),
	// The bytes, after everything that could still be naming one. A picture is
	// as much somebody's own as the diary is: it leaves with the export and it
	// goes with the deletion.
	owned('media', schema.media as never),
	// Last of the subjects: entries, todos, goals and blocks all point at it.
	owned('notebooks', schema.notebooks as never),
	owned('recurringTaskTags', schema.recurringTaskTags as never),
	owned('recurringTasks', schema.recurringTasks as never),
	owned('activities', schema.activities as never),
	owned('categories', schema.categories as never),
	// The chat's provider key. It leaves with the export and comes back with
	// the import on purpose: an export is the person's own hands, and a moved
	// instance whose assistant still answers is the point of moving one.
	owned('modelProviderKeys', schema.modelProviderKeys as never),
	// Half-finished handshakes with an assistant. They die in five minutes and
	// are listed for the same reason everything else is: a table with a
	// `user_id` that nothing names is a table the deletion leaves behind.
	owned('oauthCodes', schema.oauthCodes as never),
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
	// Handled deliberately and differently: an error report is operational
	// exhaust rather than the account's data, so it is not exported — and the
	// name is taken off it on deletion rather than the row going, because a
	// stack trace with nobody's name on it is still a bug worth fixing.
	authOwned.add('clientErrors');
	return Object.entries(schema)
		.filter(([name, table]) => {
			if (known.has(name) || authOwned.has(name)) return false;
			return !!table && typeof table === 'object' && 'userId' in (table as object);
		})
		.map(([name]) => name);
}

export type AccountExport = {
	exportedAt: string;
	/**
	 * The version of ontoplano that wrote the file.
	 *
	 * Nothing reads it. It is here because a data file that does not say what
	 * made it is a file somebody has to guess about later — and the moment to
	 * write it down is when the file is made, not when the guessing starts. An
	 * import that meets a shape it does not recognise can one day say "this was
	 * written by 0.169.0" instead of "that file is not an ontoplano export".
	 */
	version: string;
	account: { id: string; name: string; email: string };
	data: Record<string, unknown[]>;
};

/**
 * Everything the account owns, as plain JSON.
 *
 * Deliberately the raw rows rather than a prettied-up shape: an export is for
 * being complete and re-importable, not for reading nicely.

/** "in about 7 hours", for a message a person reads once and acts on. */
export function hoursUntil(iso: string | null, now: Date = new Date()): string {
	if (!iso) return 'shortly';
	const ms = new Date(iso).getTime() - now.getTime();
	if (ms <= 0) return 'now';

	const hours = Math.ceil(ms / (60 * 60 * 1000));
	if (hours <= 1) return 'in under an hour';
	return `in about ${hours} hours`;
}

/**
 * The same file the export produces, without asking permission.
 *
 * `exportAccount` counts against the day's allowance and writes an audit line,
 * both of which are right when a person asks for their data — and both of which
 * are wrong when the app is taking a safety copy on their behalf. This is the
 * rows and nothing else.
 */
export function collectAccount(userId: string, now: Date = new Date()): AccountExport {
	const account = db
		.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.get();
	if (!account) throw new Error('Account not found');

	const data: Record<string, unknown[]> = {};
	for (const table of USER_TABLES) data[table.name] = table.rows(userId);

	return { exportedAt: now.toISOString(), version: APP_VERSION, account, data };
}

/**
 * The tables that are nothing without the picture bytes beside them.
 *
 * An export without pictures leaves these out too: a gallery row or a recipe
 * image pointing at a picture that is not in the file is an inconsistency the
 * import would have to clean up, and the tags on a picture that is not there
 * tag nothing. `albums` stays — an album's name and order are the person's
 * work, and pictures put back later land in it.
 */
export const PICTURE_TABLES = ['media', 'albumMedia', 'mediaTags', 'recipeImages'] as const;

/**
 * What survives when an account is emptied but kept.
 *
 * Emptying is not deleting: the account stays, so the four things that are
 * about the account rather than made by it stay with it.
 *
 *  - `userSettings` — the theme, the first day of the week, the choices that
 *    make the app the person's. Losing those is not "my data is gone", it is
 *    "the app forgot who I am", which nobody asks for.
 *  - `subscriptions` and `billingCheckouts` — what they are paying, which
 *    emptying a notebook has no business cancelling.
 *  - `auditEvents` — the instance's record of what was done to this account,
 *    including the emptying itself. An erasure that erases the note of the
 *    erasure is the one shape this must not have.
 *
 * Everything else in `USER_TABLES` goes. Named as what is KEPT rather than as
 * what is deleted on purpose: a table added next year is content until
 * somebody says otherwise, so it is emptied by default, and the test on this
 * list makes them say so.
 */
export const KEPT_WHEN_EMPTIED = [
	'userSettings',
	'subscriptions',
	'billingCheckouts',
	'auditEvents'
] as const;

/**
 * Empty the account, and leave the account.
 *
 * Everything the person made — the same rows an export carries — in one
 * transaction, so a failure part-way leaves them with what they had rather
 * than with half of it. They stay signed in, on the same plan, with the same
 * address and password, looking at an app with nothing in it.
 *
 * `deleteAccount` below is the other one: this walks the same tables and stops
 * before the rows that ARE the account.
 */
export function emptyAccount(userId: string): void {
	const kept = new Set<string>(KEPT_WHEN_EMPTIED);
	db.transaction((tx) => {
		for (const table of USER_TABLES) if (!kept.has(table.name)) table.remove(tx, userId);
	});
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
		/*
		 * The note about this deletion is disowned, not deleted — the same
		 * arrangement `clientErrors` gets below. Filed under the account, it
		 * would go down with the audit rows in the walk; with no subject it
		 * survives, and the address it is about is in its `detail`.
		 */
		tx.update(schema.auditEvents)
			.set({ userId: null })
			.where(
				and(
					eq(schema.auditEvents.userId, userId),
					eq(schema.auditEvents.event, 'account_deleted')
				) as SQL
			)
			.run();

		for (const table of USER_TABLES) table.remove(tx, userId);

		/*
		 * Seats, in both directions.
		 *
		 * This account may be ON somebody's plan, and may BE somebody's plan —
		 * and neither row carries a `user_id`, so the table-walk above cannot
		 * see them. Left behind, the foreign key refuses the delete; worse, a
		 * seat pointing at a deleted payer would leave somebody entitled by a
		 * row nobody can cancel.
		 */
		tx.delete(schema.planMembers)
			.where(eq(schema.planMembers.memberId, userId) as SQL)
			.run();
		tx.delete(schema.planMembers)
			.where(eq(schema.planMembers.ownerId, userId) as SQL)
			.run();

		// Not deleted, disowned. The report stops being anybody's the moment
		// the account goes; the crash it describes is still worth fixing.
		tx.update(schema.clientErrors)
			.set({ userId: null })
			.where(eq(schema.clientErrors.userId, userId) as SQL)
			.run();

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

/**
 * How much schema this database has.
 *
 * One number, and it is the honest answer to "is this copy up to date with the
 * build it is running" — which is a real question on an instance that is a
 * device, because a device runs the app's own migrations on itself and one
 * that has not opened the app in a month is genuinely behind.
 */
export function tableCount(): number {
	const row = db.get(
		sql`select count(*) as n from sqlite_master where type = 'table' and name not like 'sqlite_%'`
	) as { n: number } | undefined;
	return Number(row?.n ?? 0);
}
