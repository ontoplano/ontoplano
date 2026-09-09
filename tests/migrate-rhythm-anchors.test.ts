/**
 * Existing blocks get the day they were written down.
 *
 * The rule refuses any date before its anchor now, so a block carrying no
 * anchor would go on filling the past forever. The honest start date is
 * `created_at`: nothing was planned by a block before the block existed.
 *
 * What must not happen is a block quietly stopping. Every shape that already
 * had an anchor keeps it, and a row whose `created_at` is unreadable is left
 * alone rather than given a start date invented from nothing.
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-rhythm-anchors-'));
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

	// Everything up to, but not including, the migration under test.
	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0062_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into categories (id, user_id, name, color) values (1,'u1','Work','#1d4ed8');

		-- The ordinary case: a weekly block written down in September.
		insert into recurring_tasks
			(id, user_id, weekday, recurrence, start_time, mode, category_id, created_at)
			values (1,'u1',5,'weekly','12:15','category',1,'2026-09-09 13:00:00');

		-- One day of the month, and one clamped to the month's end.
		insert into recurring_tasks
			(id, user_id, weekday, recurrence, start_time, mode, category_id, created_at)
			values (2,'u1',0,'monthly:1','09:00','category',1,'2026-09-09 13:00:00');
		insert into recurring_tasks
			(id, user_id, weekday, recurrence, start_time, mode, category_id, created_at)
			values (3,'u1',0,'monthly:31','09:00','category',1,'2026-07-04 08:00:00');

		-- Shapes that already counted from something. Untouched.
		insert into recurring_tasks
			(id, user_id, weekday, recurrence, start_time, mode, category_id, created_at)
			values (4,'u1',1,'weeks:2:2026-08-17','09:00','category',1,'2026-09-09 13:00:00');
		insert into recurring_tasks
			(id, user_id, weekday, recurrence, start_time, mode, category_id, created_at)
			values (5,'u1',1,'days:3:2026-08-17','09:00','category',1,'2026-09-09 13:00:00');

		-- A stamp nothing can read a date out of. Left alone, so the block keeps
		-- happening rather than being anchored to a guess.
		insert into recurring_tasks
			(id, user_id, weekday, recurrence, start_time, mode, category_id, created_at)
			values (6,'u1',5,'weekly','12:15','category',1,'not a timestamp');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const ruleOf = (id: number) =>
	(
		after.prepare('select recurrence from recurring_tasks where id = ?').get(id) as {
			recurrence: string;
		}
	).recurrence;

describe('0062, every rhythm starting somewhere', () => {
	test('a weekly block starts the day it was written down', () => {
		expect(ruleOf(1)).toBe('weekly:2026-09-09');
	});

	test('so does a monthly one, whichever day of the month it is', () => {
		expect(ruleOf(2)).toBe('monthly:1:2026-09-09');
		expect(ruleOf(3)).toBe('monthly:31:2026-07-04');
	});

	test('a rule that already counted from a date keeps that date', () => {
		expect(ruleOf(4)).toBe('weeks:2:2026-08-17');
		expect(ruleOf(5)).toBe('days:3:2026-08-17');
	});

	test('an unreadable stamp leaves the block alone rather than guessing', () => {
		expect(ruleOf(6)).toBe('weekly');
	});
});
