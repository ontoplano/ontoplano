/**
 * The shopping tables become the inventory tables.
 *
 * 0081 renames two tables and a column, rebuilds the two tables that point at
 * the renamed one, and rewrites the scopes on tokens already handed out and
 * the events on webhooks already subscribed. None of that is drizzle's — a
 * renamed table reads to drizzle-kit as a new one beside a dropped one — so
 * it is hand-written, and hand-written data movement is what a test is for.
 * This builds a database as it stood at 0080, fills it the way a real account
 * is filled, runs the real migrator, and reads what came out.
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-rename-inventory-'));
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
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0081_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into shopping_categories (id, user_id, name, is_food, shared_with_family, sort_order)
			values (1,'u1','Dairy',1,1,3);
		insert into shopping_items (id, user_id, name, type, shopping_category_id, qty, ideal_qty, bought, price_cents, attributes)
			values (1,'u1','Milk','replenish',1,0,2,0,349,'{"fat":"semi"}'),
			       (2,'u1','Measuring tape','someday',null,1,1,1,null,'{}');
		insert into recipes (id, user_id, title) values (1,'u1','Porridge');
		insert into recipe_items (id, user_id, recipe_id, item_id, quantity, unit)
			values (1,'u1',1,1,0.3,'l');
		insert into price_points (id, user_id, item_id, price_cents, for_date)
			values (1,'u1',1,349,'2026-01-02');
		insert into api_tokens (id, user_id, name, prefix, token_hash, scopes, created_at, updated_at)
			values (1,'u1','phone','onto_ab','deadbeef','todos:read,shopping:read,shopping:write,inventory:read,inventory:write','2026-01-01','2026-01-01'),
			       (2,'u1','list only','onto_cd','feedface','shopping:read','2026-01-01','2026-01-01');
		insert into webhook_subscriptions (id, user_id, url, events, secret, created_at, updated_at)
			values (1,'u1','https://example.invalid/hook','todo.created,shopping.added,shopping.bought','s','2026-01-01','2026-01-01');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const one = <T>(sql: string) => after.prepare(sql).get() as T;

describe('0081, on an account with a list, a cupboard and a recipe', () => {
	test('a thing keeps everything it had, under the new table', () => {
		expect(
			one(
				'select name, type, inventory_category_id, qty, ideal_qty, price_cents, attributes from inventory_items where id = 1'
			)
		).toEqual({
			name: 'Milk',
			type: 'replenish',
			inventory_category_id: 1,
			qty: 0,
			ideal_qty: 2,
			price_cents: 349,
			attributes: '{"fat":"semi"}'
		});
	});

	test('a section keeps its name and everything chosen about it', () => {
		expect(
			one(
				'select name, is_food, shared_with_family, sort_order from inventory_categories where id = 1'
			)
		).toEqual({ name: 'Dairy', is_food: 1, shared_with_family: 1, sort_order: 3 });
	});

	/*
	 * The half a rename gets wrong quietly.
	 *
	 * `recipe_items` and `price_points` both point at the renamed table, and
	 * SQLite only rewrites a REFERENCES clause when foreign keys are on — which
	 * they are not, for the whole of a migration. Both are rebuilt by hand, and
	 * this is what says so.
	 */
	test('an ingredient still reaches the thing it names', () => {
		expect(
			one<{ name: string }>(
				'select i.name from recipe_items ri join inventory_items i on i.id = ri.item_id where ri.id = 1'
			).name
		).toBe('Milk');
		expect(
			one<{ price_cents: number }>(
				'select p.price_cents from price_points p join inventory_items i on i.id = p.item_id where p.id = 1'
			).price_cents
		).toBe(349);
	});

	test('and nothing points at a table that is gone', () => {
		expect(after.pragma('foreign_key_check')).toEqual([]);
		expect(
			one<{ n: number }>(
				"select count(*) as n from sqlite_master where name in ('shopping_items','shopping_categories')"
			).n
		).toBe(0);
	});

	/*
	 * Two scopes swap names in one migration, which is the whole reason the
	 * order of those two statements matters: `inventory:*` is the locations
	 * half and becomes `locations:*` first, and only then does `shopping:*`
	 * take the name it left behind.
	 */
	test('a token keeps exactly what it could reach', () => {
		expect(one<{ scopes: string }>('select scopes from api_tokens where id = 1').scopes).toBe(
			'todos:read,inventory:read,inventory:write,locations:read,locations:write'
		);
		expect(one<{ scopes: string }>('select scopes from api_tokens where id = 2').scopes).toBe(
			'inventory:read'
		);
	});

	test('a webhook keeps listening for the same things', () => {
		expect(
			one<{ events: string }>('select events from webhook_subscriptions where id = 1').events
		).toBe('todo.created,inventory.added,inventory.bought');
	});
});
