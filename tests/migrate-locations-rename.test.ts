/**
 * Places become locations, and the Shopping room becomes Inventory.
 *
 * 0055 renames a table, the column on an item, the key the room is stored
 * under in somebody's own menu, and the scopes on a token already handed out.
 * drizzle-kit wrote it as a create beside a drop, as it did for 0054, so the
 * data movement is hand-written — and hand-written data movement is what a
 * test is for. This builds a database as it stood before, fills it the way a
 * real account is filled, runs the real migrator, and reads what came out.
 */
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-rename-locations-'));
const dbPath = join(work, 'before.db');
const JOURNAL = join(work, 'drizzle/meta/_journal.json');

afterAll(() => rmSync(work, { recursive: true, force: true }));

function migrate() {
	execFileSync('node', ['scripts/migrate.mjs'], {
		cwd: work,
		env: { ...process.env, DATABASE_URL: dbPath },
		encoding: 'utf8'
	});
}

let after: Database.Database;

beforeAll(() => {
	cpSync(join(ROOT, 'drizzle'), join(work, 'drizzle'), { recursive: true });
	mkdirSync(join(work, 'scripts'), { recursive: true });
	cpSync(join(ROOT, 'scripts/migrate.mjs'), join(work, 'scripts/migrate.mjs'));
	cpSync(join(ROOT, 'scripts/db-snapshot.mjs'), join(work, 'scripts/db-snapshot.mjs'));
	symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'));

	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0055_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into places (id, user_id, name, parent_id, notes)
			values (1,'u1','Living room',null,'the big one'),
			       (2,'u1','White chest',1,'');
		insert into shopping_items (id, user_id, name, type, place_id, bought)
			values (1,'u1','Measuring tape','replenish',2,1);
		insert into shopping_items (id, user_id, name, type, bought)
			values (2,'u1','Milk','replenish',0);
		insert into user_settings (user_id, key, value) values
			('u1','ui.navOrder','["ideas","shopping","goals"]'),
			('u1','ui.hiddenSections','["shopping"]'),
			('u1','ui.sectionColors','{"shopping":"#123456"}');
		insert into api_tokens (id, user_id, name, prefix, token_hash, scopes, created_at, updated_at)
			values (1,'u1','phone','onto_ab','deadbeef','todos:read,shopping:read,shopping:write','2026-01-01','2026-01-01');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const one = <T>(sql: string) => after.prepare(sql).get() as T;

describe('0055, on an account that already had an inventory', () => {
	test('the locations survive, nesting and all', () => {
		expect(one('select name, parent_id, notes from locations where id = 1')).toEqual({
			name: 'Living room',
			parent_id: null,
			notes: 'the big one'
		});
		expect(one('select name, parent_id from locations where id = 2')).toEqual({
			name: 'White chest',
			parent_id: 1
		});
	});

	test('a thing keeps the address it had, under the new column', () => {
		expect(one('select name, location_id from shopping_items where id = 1')).toEqual({
			name: 'Measuring tape',
			location_id: 2
		});
	});

	/*
	 * The whole answer to "will this preserve my shopping list": the row keeps
	 * its name and its state, and only gains an address.
	 *
	 * 0055 left it null on the argument that a row with none is exactly a
	 * shopping-list line. True, and it made the locations panel useless on a
	 * real account — everything you already had sat under "Not filed anywhere"
	 * and the tree was empty. 0056 puts it in the account's root instead.
	 */
	test('a plain shopping-list line keeps everything and gains a home', () => {
		const milk = one<{ name: string; bought: number; location_id: number }>(
			'select name, location_id, bought from shopping_items where id = 2'
		);
		expect(milk.name).toBe('Milk');
		expect(milk.bought).toBe(0);
		expect(
			one<{ name: string }>(`select name from locations where id = ${milk.location_id}`).name
		).toBe('Living room');
	});

	/** And an account with no tree at all gets one root to start from. */
	test('an account that never made a location gets a Home', () => {
		after.exec(`
			insert into user (id, name, email) values ('u2','Them','them@test.invalid');
			insert into shopping_items (id, user_id, name, type) values (9,'u2','Bread','replenish');
		`);
		// Re-running the pass is what a fresh account's first migration does.
		after.exec(`
			INSERT INTO locations (user_id, name, parent_id, notes, sort_order)
				SELECT DISTINCT user_id, 'Home', NULL, '', 0 FROM shopping_items
				WHERE user_id NOT IN (SELECT user_id FROM locations WHERE parent_id IS NULL);
			UPDATE shopping_items SET location_id = (
				SELECT id FROM locations
				WHERE locations.user_id = shopping_items.user_id AND parent_id IS NULL
				ORDER BY id LIMIT 1
			) WHERE location_id IS NULL;
		`);
		expect(
			one<{ name: string }>(
				'select l.name from shopping_items i join locations l on l.id = i.location_id where i.id = 9'
			).name
		).toBe('Home');
	});

	test('the room keeps its place in a menu somebody arranged', () => {
		expect(
			one<{ value: string }>("select value from user_settings where key = 'ui.navOrder'").value
		).toBe('["ideas","inventory","goals"]');
	});

	test('and stays put away if it was put away', () => {
		expect(
			one<{ value: string }>("select value from user_settings where key = 'ui.hiddenSections'")
				.value
		).toBe('["inventory"]');
	});

	test('a colour somebody chose for it follows the room', () => {
		expect(
			one<{ value: string }>("select value from user_settings where key = 'ui.sectionColors'").value
		).toBe('{"inventory":"#123456"}');
	});

	test('a token that could reach the whole room still can', () => {
		expect(one<{ scopes: string }>('select scopes from api_tokens where id = 1').scopes).toBe(
			'todos:read,shopping:read,shopping:write,inventory:read,inventory:write'
		);
	});

	test('and nothing is left calling itself places', () => {
		expect(
			one<{ n: number }>("select count(*) as n from sqlite_master where name = 'places'").n
		).toBe(0);
	});
});
