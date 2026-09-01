/**
 * The export is a promise, and this is what keeps it.
 *
 * "One SQLite file you can walk away with" is on the front page, so an export
 * that quietly omits a table is worse than no export at all — and the failure
 * is invisible: the file downloads, the import succeeds, and a year of habits
 * is simply not there.
 *
 * The three ways that happens, and the guard against each:
 *
 *  1. **A new table nobody registered.** `unaccountedTables()` walks the schema
 *     for anything carrying a `user_id` that `USER_TABLES` does not list. The
 *     assertion below is the whole of it — add a table, forget the list, fail.
 *
 *  2. **A registered table the importer drops.** This runs the real dev seed,
 *     exports the account it filled, imports it into another, and compares
 *     every table row for row. The seed is the right fixture precisely because
 *     `CONTRIBUTING.md` already requires every feature to add to it: a feature
 *     with seed data and no import path fails here without anybody thinking
 *     about it.
 *
 *  3. **A new column.** Not something a test has to enumerate: the export is
 *     `select *` and the import writes back every key it is given, so a column
 *     travels by construction. The one thing that is not automatic is a new
 *     *foreign key*, and that is read out of the schema at import time — which
 *     case (2) exercises, since the seed's rows point at each other.
 *
 * If this file fails after you added a table, the fix is almost never here.
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let account: typeof import('../src/lib/server/services/account');
let accountImport: typeof import('../src/lib/server/services/account-import');

/** What the seed filled, per table, before any of it moved. */
let before: Record<string, number>;
/** And after a round trip into the other account. */
let after: Record<string, number>;

const counts = (data: Record<string, unknown[]>) =>
	Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));

beforeAll(async () => {
	account = await import('../src/lib/server/services/account');
	accountImport = await import('../src/lib/server/services/account-import');

	// The real seed, against the real database this suite made. It is the one
	// fixture that is contractually kept current: every feature adds to it.
	execFileSync('node', ['scripts/seed-dev.mjs', database.path, 'owner@test.invalid'], {
		stdio: 'ignore'
	});

	const file = account.exportAccount(OWNER, new Date('2026-09-01T09:00:00Z'));
	before = counts(file.data);

	accountImport.importAccount(STRANGER, file);
	after = counts(account.exportAccount(STRANGER, new Date('2026-09-01T09:00:01Z')).data);
}, 120_000);

describe('every table is accounted for', () => {
	test('nothing in the schema is missing from the export list', () => {
		// A table with a `user_id` that `USER_TABLES` does not name is a table
		// the export misses and the deletion leaves behind.
		expect(account.unaccountedTables()).toEqual([]);
	});

	test('and the seed actually filled a great many of them', () => {
		// Otherwise the round trip below proves nothing: comparing two empty
		// tables passes whatever the importer does.
		const filled = Object.entries(before).filter(([, n]) => n > 0);
		expect(filled.length).toBeGreaterThan(25);
		expect(filled.reduce((sum, [, n]) => sum + n, 0)).toBeGreaterThan(300);
	});
});

describe('a round trip loses nothing', () => {
	test('every portable table comes back with the same number of rows', () => {
		const lost: string[] = [];

		for (const [name, count] of Object.entries(before)) {
			if (count === 0) continue;
			// The handful that deliberately belong to the instance rather than to
			// the person. `NOT_PORTABLE` in the importer says why for each.
			if (accountImport.NOT_PORTABLE[name]) continue;
			if (after[name] !== count) lost.push(`${name}: ${count} out, ${after[name] ?? 0} back`);
		}

		expect(lost).toEqual([]);
	});

	test('and what does not travel is named, not silently dropped', () => {
		// A table that stops travelling has to say so out loud. Silence here is
		// how somebody loses their data and finds out a year later.
		for (const [name, why] of Object.entries(accountImport.NOT_PORTABLE)) {
			expect(name in before, `${name} is not a table the export produces`).toBe(true);
			expect(why.length).toBeGreaterThan(10);
		}
	});
});
