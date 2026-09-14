import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

/**
 * Emptying an account takes everything the person made and nothing else.
 *
 * Two things have to hold, and the second is the one that would be a disaster:
 * the account's own rows go, and no other account's do. `emptyAccount` walks
 * the same `USER_TABLES` the export and the deletion walk, filtered by
 * `user_id` — so this drives it against a database holding two seeded accounts
 * and asserts the other one is untouched, table by table, rather than trusting
 * the filter.
 *
 * It also pins what survives. Emptying is not deleting: the settings, the
 * subscription, the checkouts and the audit log belong to the account rather
 * than to the data in it, and an erasure that cancels somebody's plan or
 * erases the note that it happened is the wrong shape.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let account: typeof import('../src/lib/server/services/account');

/**
 * Rows per table, straight out of SQLite, for every table that has a
 * `user_id`.
 *
 * Not `exportAccount`, which was the obvious way and the wrong one twice over:
 * it writes an audit row every time it is called, so the numbers moved as the
 * test read them, and it spends the account's daily export allowance. Counting
 * the tables directly is also the stronger check — it does not trust
 * `USER_TABLES` to be complete, which is the list the thing under test walks.
 */
function counter(path: string) {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const Database = require('better-sqlite3');
	const db = new Database(path, { readonly: true });
	const owned = db
		.prepare("select name from sqlite_master where type = 'table'")
		.all()
		.map((r: { name: string }) => r.name)
		.filter((t: string) =>
			db
				.prepare(`pragma table_info("${t}")`)
				.all()
				.some((c: { name: string }) => c.name === 'user_id')
		);

	return (id: string) =>
		Object.fromEntries(
			owned.map((t: string) => [
				t,
				db.prepare(`select count(*) as n from "${t}" where user_id = ?`).get(id).n as number
			])
		) as Record<string, number>;
}

let countsFor: (id: string) => Record<string, number>;

/** `userSettings` is `user_settings` once it is a table. */
const asTable = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

let mineBefore: Record<string, number>;
let theirsBefore: Record<string, number>;

beforeAll(async () => {
	account = await import('../src/lib/server/services/account');

	/*
	 * The real seed, twice — once into each account.
	 *
	 * `seed-dev.mjs` finds its account by address, and `seedAccounts` above
	 * makes exactly these two. The real seed rather than a fixture of this
	 * file's own: it is the one that is contractually kept current, so a
	 * feature that adds a table adds rows here without anybody remembering to.
	 */
	for (const email of ['owner@test.invalid', 'stranger@test.invalid']) {
		execFileSync('node', ['scripts/seed-dev.mjs', database.path, email], { stdio: 'ignore' });
	}

	countsFor = counter(database.path);
	mineBefore = countsFor(OWNER);
	theirsBefore = countsFor(STRANGER);
	// Two full runs of the real seed, sharing a machine with the rest of the
	// suite: comfortably past the default ten seconds when the box is busy.
}, 120_000);

describe('emptying an account', () => {
	test('the seed put something in both of them', () => {
		// Otherwise everything below passes by having nothing to lose.
		expect(Object.values(mineBefore).reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
		expect(Object.values(theirsBefore).reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
	});

	test('takes every table that is not on the keep list', () => {
		account.emptyAccount(OWNER);
		const after = countsFor(OWNER);
		const kept = new Set<string>(account.KEPT_WHEN_EMPTIED.map(asTable));

		for (const [name, rows] of Object.entries(after)) {
			if (kept.has(name)) continue;
			expect(rows, `${name} still has ${rows} rows`).toBe(0);
		}
	});

	test('and leaves what belongs to the account rather than to the data', () => {
		const after = countsFor(OWNER);
		for (const name of account.KEPT_WHEN_EMPTIED.map(asTable)) {
			// Only meaningful where the seed made one, which is the point of
			// asserting against the before rather than against a number.
			if (!mineBefore[name]) continue;
			expect(after[name], `${name} was emptied and should not have been`).toBe(mineBefore[name]);
		}
	});

	test('and touches nobody else, table by table', () => {
		expect(countsFor(STRANGER)).toEqual(theirsBefore);
	});

	test('is safe to run twice', () => {
		// A second one on an already-empty account is a no-op rather than a
		// failure: somebody pressing the button again is not an error condition.
		expect(() => account.emptyAccount(OWNER)).not.toThrow();
		expect(countsFor(STRANGER)).toEqual(theirsBefore);
	});

	test('keeps the account itself', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const Database = require('better-sqlite3');
		const db = new Database(database.path, { readonly: true });
		const rows = db.prepare('select count(*) as n from user where id = ?').get(OWNER).n;
		db.close();
		expect(rows, 'the account row went with the data').toBe(1);
	});
});

describe('the keep list', () => {
	test('is exactly the four things that are about the account', () => {
		/*
		 * Pinned, so a table added next year is a decision rather than an
		 * accident. New tables are emptied by default — that is the fail-safe
		 * direction for something called "delete everything" — and adding one to
		 * the keep list means changing this line and saying why.
		 */
		expect([...account.KEPT_WHEN_EMPTIED].sort()).toEqual([
			'auditEvents',
			'billingCheckouts',
			'subscriptions',
			'userSettings'
		]);
	});
});
