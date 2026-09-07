/**
 * The rename that could have deleted every workout.
 *
 * 0054 renames the `trainings` table to `workouts`, the `training_id` on a
 * block to `workout_id`, and the `training` mode value to `workout`.
 * drizzle-kit cannot see a rename — it wrote `CREATE TABLE workouts` beside
 * `DROP TABLE trainings` with nothing carried across, and rebuilt both block
 * tables reading `workout_id` from tables that still called it `training_id`.
 * Both were corrected by hand, which is exactly the kind of edit that needs a
 * test rather than a careful read: this builds a database as it stood before
 * the migration, fills it, runs the real migrator, and looks at what came out.
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

/*
 * In a tree of its own, because building the "before" database means running
 * the migrator with 0054 absent from the journal — and editing the repo's own
 * journal would hand every other test file running beside this one a schema
 * from before the rename.
 */
const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-rename-workouts-'));
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

	// Every migration except this one: the database people are upgrading from.
	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const without = {
		...journal,
		entries: journal.entries.filter((e: { tag: string }) => !e.tag.startsWith('0054_'))
	};
	writeFileSync(JOURNAL, JSON.stringify(without, null, 2));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into trainings (id, user_id, title, kind, plan, minutes)
			values (1,'u1','Leg day','strength','3x8 squats',60);
		insert into recurring_tasks (id, user_id, weekday, start_time, duration_minutes, mode, training_id)
			values (1,'u1',2,'07:00',45,'training',1);
		insert into exceptional_tasks (id, user_id, date, start_time, duration_minutes, mode, training_id)
			values (1,'u1','2026-09-10','18:00',60,'training',1);
		insert into categories (id, user_id, name, color) values (1,'u1','Work','#111111');
		insert into recurring_tasks (id, user_id, weekday, start_time, duration_minutes, mode, category_id, label)
			values (2,'u1',1,'09:00',180,'category',1,'Deep work');
		insert into planning_schemes (id, user_id, name) values (1,'u1','Term time');
		insert into scheme_slots (id, user_id, scheme_id, weekday, start_time, duration_minutes, mode)
			values (1,'u1',1,2,'07:00',45,'training');
		insert into api_tokens (id, user_id, name, prefix, token_hash, scopes, created_at, updated_at)
			values (1,'u1','phone','onto_ab','deadbeef','todos:read,trainings:read,trainings:write','2026-01-01','2026-01-01');
	`);
	before.close();

	// And now the one under test, from the journal as it really is.
	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const one = <T>(sql: string) => after.prepare(sql).get() as T;

describe('0054, on a database that already had workouts in it', () => {
	test('the workouts themselves survive, with everything written on them', () => {
		expect(one('select title, plan, minutes from workouts where id = 1')).toEqual({
			title: 'Leg day',
			plan: '3x8 squats',
			minutes: 60
		});
	});

	test('a weekly block still points at its workout, under the new name', () => {
		expect(one('select mode, workout_id from recurring_tasks where id = 1')).toEqual({
			mode: 'workout',
			workout_id: 1
		});
	});

	test('and so does a one-off', () => {
		expect(one('select mode, workout_id from exceptional_tasks where id = 1')).toEqual({
			mode: 'workout',
			workout_id: 1
		});
	});

	test('a block that was never a workout is left exactly as it was', () => {
		expect(one('select mode, label from recurring_tasks where id = 2')).toEqual({
			mode: 'category',
			label: 'Deep work'
		});
	});

	test('a saved scheme carries the mode too, since it copies one', () => {
		expect(one('select mode from scheme_slots where id = 1')).toEqual({ mode: 'workout' });
	});

	test('a token already handed out keeps the permission it was given', () => {
		expect(one('select scopes from api_tokens where id = 1')).toEqual({
			scopes: 'todos:read,workouts:read,workouts:write'
		});
	});

	test('and nothing is left calling itself trainings', () => {
		expect(
			one<{ n: number }>("select count(*) as n from sqlite_master where name = 'trainings'").n
		).toBe(0);
	});
});
