/**
 * Having a thing becomes how many of it you have.
 *
 * The tick carried the whole meaning of "is this on the list", and it is a
 * count now — so the migration has to put every existing row on the right side
 * of the same line it was already on. A ticked thing has one and keeps one; an
 * unticked thing has none and keeps one, which is exactly "still to buy".
 * drizzle wrote the rebuild reading the new columns from the table that does
 * not have them, so the computation is hand-written and this is what checks it.
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-quantities-'));
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
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0058_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into shopping_items (id, user_id, name, type, bought, bought_at)
			values (1,'u1','Milk','replenish',1,'2026-09-01T10:00:00Z');
		insert into shopping_items (id, user_id, name, type, bought)
			values (2,'u1','Bread','replenish',0);
		insert into shopping_items (id, user_id, name, type, bought)
			values (3,'u1','A proper armchair','someday',0);
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const one = <T>(sql: string) => after.prepare(sql).get() as T;

describe('0058, on a list that was ticks', () => {
	test('a thing you had has one of it, and still counts as had', () => {
		expect(one('select qty, ideal_qty, bought from shopping_items where id = 1')).toEqual({
			qty: 1,
			ideal_qty: 1,
			bought: 1
		});
	});

	test('a thing you had not has none, and is still on the list', () => {
		expect(one('select qty, ideal_qty, bought from shopping_items where id = 2')).toEqual({
			qty: 0,
			ideal_qty: 1,
			bought: 0
		});
	});

	/*
	 * The line the whole list is drawn on. Every row must land on the side it
	 * was already on, or somebody opens the app to a shopping list that has
	 * quietly changed its mind about what they need.
	 */
	test('and "still to buy" means exactly what it meant before', () => {
		const toBuy = after
			.prepare('select name from shopping_items where qty < max(ideal_qty, 1) order by id')
			.all() as { name: string }[];
		expect(toBuy.map((r) => r.name)).toEqual(['Bread', 'A proper armchair']);
	});

	test('the date it stopped being something to get is kept', () => {
		expect(
			one<{ bought_at: string }>('select bought_at from shopping_items where id = 1').bought_at
		).toBe('2026-09-01T10:00:00Z');
	});
});
