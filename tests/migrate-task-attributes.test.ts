/**
 * 0110 and 0111: a task block's `meta` becomes its attributes, a todo gains
 * attributes of its own, and a repeating task block can be filed in a
 * notebook — onto a database that already has blocks with pairs on them,
 * built as it stood before and taken through the real migrator.
 *
 * The rename is the part that could lose something: every pair a plugin was
 * reading has to be there under the new name, on both kinds of block, and the
 * rows that point at a repeating block have to survive its table being
 * rebuilt.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { installMigrator } from './helpers/migrator';

const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-task-attributes-'));
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
	installMigrator(work);

	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const at = journal.entries.findIndex((e: { tag: string }) =>
		e.tag.startsWith('0110_task_attributes')
	);
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into categories (id, user_id, name) values (7, 'u1', 'health');
		insert into notebooks (id, user_id, title, folder) values (3, 'u1', 'Marathon', '');
		insert into recurring_tasks (id, user_id, weekday, start_time, mode, category_id, label, meta)
			values (1, 'u1', 0, '07:00', 'category', 7, 'run', '{"alarm":"true","remind_min":"5"}'),
			       (2, 'u1', 2, '18:00', 'category', 7, 'stretch', '{}');
		insert into exceptional_tasks (id, user_id, date, start_time, mode, category_id, label, notebook_id, meta)
			values (4, 'u1', '2026-10-04', '09:00', 'category', 7, 'race', 3, '{"bib":"1142"}');
		insert into task_records (id, user_id, slot_id, scheduled_at) values (10, 'u1', 1, '2026-09-28T07:00:00');
		insert into suppressed_slots (user_id, slot_id, date) values ('u1', 2, '2026-09-30');
		insert into todo_tasks (id, user_id, title) values (5, 'u1', 'buy gels');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
	after.pragma('foreign_keys = ON');
});

describe('0110, `meta` renamed to attributes', () => {
	test('a repeating block keeps every pair it had', () => {
		expect(after.prepare('select id, attributes from recurring_tasks order by id').all()).toEqual([
			{ id: 1, attributes: '{"alarm":"true","remind_min":"5"}' },
			{ id: 2, attributes: '{}' }
		]);
	});

	test('and so does a one-off, with its notebook', () => {
		expect(
			after.prepare('select id, attributes, notebook_id from exceptional_tasks').all()
		).toEqual([{ id: 4, attributes: '{"bib":"1142"}', notebook_id: 3 }]);
	});

	test('no `meta` column is left on either', () => {
		for (const table of ['recurring_tasks', 'exceptional_tasks']) {
			const columns = (
				after.prepare(`pragma table_info(${table})`).all() as { name: string }[]
			).map((c) => c.name);
			expect(columns).toContain('attributes');
			expect(columns).not.toContain('meta');
		}
	});

	test('a todo that was there has none, and can be given some', () => {
		expect(after.prepare('select attributes from todo_tasks where id = 5').get()).toEqual({
			attributes: '{}'
		});
		after.prepare(`update todo_tasks set attributes = '{"shop":"run club"}' where id = 5`).run();
	});
});

describe('0111, a repeating block in a notebook', () => {
	test('what pointed at a repeating block still does, after the rebuild', () => {
		expect(after.prepare('select slot_id from task_records where id = 10').get()).toEqual({
			slot_id: 1
		});
		expect(after.prepare('select slot_id from suppressed_slots').all()).toEqual([{ slot_id: 2 }]);
		expect(after.pragma('foreign_key_check')).toEqual([]);
	});

	test('it is filed, and let go when the notebook is deleted', () => {
		after.prepare('update recurring_tasks set notebook_id = 3 where id = 1').run();
		expect(() =>
			after.prepare('update recurring_tasks set notebook_id = 99 where id = 2').run()
		).toThrow(/FOREIGN KEY/);

		after.prepare('delete from notebooks where id = 3').run();
		expect(after.prepare('select notebook_id from recurring_tasks where id = 1').get()).toEqual({
			notebook_id: null
		});
		// The one-off beside it, the same way, as it always was.
		expect(after.prepare('select notebook_id from exceptional_tasks where id = 4').get()).toEqual({
			notebook_id: null
		});
	});
});
