/**
 * The number on a goal becomes a measure beside it.
 *
 * 0066 moves `target_value` / `current_value` / `unit` off the goal and into
 * `goal_targets`, then rebuilds the table without them. drizzle-kit writes the
 * rebuild and would have dropped what was in those columns, so the movement is
 * hand-written — and hand-written data movement is what a test is for. This
 * builds the database as it stood before, fills it the way a used account is
 * filled, runs the real migrator, and reads what came out.
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-goal-targets-'));
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
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0066_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into goal_areas (id, user_id, name, color) values (1,'u1','Study','#123456');
		insert into goals (id, user_id, area_id, title, horizon, period_start, target_value, current_value, unit)
			values (1,'u1',1,'Read twelve books','year','2026-01-01',12,5,'books');
		insert into goals (id, user_id, title, horizon, period_start)
			values (2,'u1','Learn to sail','year','2026-01-01');
		insert into goals (id, user_id, title, horizon, period_start, target_value, current_value, unit)
			values (3,'u1','Run a marathon','quarter','2026-01-01',42.2,10.5,'');
		insert into todo_tasks (id, user_id, title) values (1,'u1','buy the boat');
		insert into goal_links (id, user_id, goal_id, todo_id) values (1,'u1',2,1);
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const one = <T>(sql: string) => after.prepare(sql).get() as T;

describe('0066, on an account that already counted things', () => {
	test('a goal that had a target keeps it, and how far along it was', () => {
		expect(
			one(
				'select target_value, current_value, unit, sort_order from goal_targets where goal_id = 1'
			)
		).toEqual({ target_value: 12, current_value: 5, unit: 'books', sort_order: 0 });
	});

	test('the measure belongs to the same account as its goal', () => {
		expect(
			one<{ user_id: string }>('select user_id from goal_targets where goal_id = 1').user_id
		).toBe('u1');
	});

	test('a fractional target with no unit survives both', () => {
		expect(
			one('select target_value, current_value, unit from goal_targets where goal_id = 3')
		).toEqual({
			target_value: 42.2,
			current_value: 10.5,
			unit: ''
		});
	});

	test('a goal that counted nothing gains no measure', () => {
		expect(one<{ n: number }>('select count(*) as n from goal_targets where goal_id = 2').n).toBe(
			0
		);
	});

	test('the goals themselves survive the rebuild, links and area included', () => {
		expect(one('select title, area_id, horizon, period_start from goals where id = 1')).toEqual({
			title: 'Read twelve books',
			area_id: 1,
			horizon: 'year',
			period_start: '2026-01-01'
		});
		expect(one<{ n: number }>('select count(*) as n from goal_links where goal_id = 2').n).toBe(1);
	});

	test('and the goal no longer carries a number of its own', () => {
		const columns = after
			.prepare('select name from pragma_table_info(?)')
			.all('goals')
			.map((c) => (c as { name: string }).name);
		expect(columns).not.toContain('target_value');
		expect(columns).not.toContain('current_value');
		expect(columns).not.toContain('unit');
	});

	test('deleting a goal takes its measures with it', () => {
		after.exec('delete from goals where id = 1');
		expect(one<{ n: number }>('select count(*) as n from goal_targets where goal_id = 1').n).toBe(
			0
		);
	});
});
