/**
 * Three lines a week become one note.
 *
 * The lines are the only running account of a year this app keeps, so the
 * migration that folds them has to lose nothing: three lines become three
 * paragraphs, a week that only used one keeps it as it was, and a week whose
 * lines started at position 2 — which happens whenever somebody left the first
 * box empty — must not be emptied by a rule that only reads position 1.
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-one-note-'));
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
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0060_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into user (id, name, email) values ('u2','You','you@test.invalid');

		-- A full week: three lines, in order.
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u1','2026-08-31',1,'shipped the thing');
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u1','2026-08-31',2,'slept badly');
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u1','2026-08-31',3,'earlier nights');

		-- One line only.
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u1','2026-08-24',1,'quiet week');

		-- First box left empty: the lines start at 2.
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u1','2026-08-17',2,'the roof leaked');
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u1','2026-08-17',3,'call somebody about it');

		-- Another account, same weeks, so the fold cannot reach across accounts.
		insert into weekly_reviews (user_id, week_start, position, content)
			values ('u2','2026-08-31',1,'mine, not theirs');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const noteFor = (user: string, week: string) =>
	(
		after
			.prepare('select content from weekly_reviews where user_id = ? and week_start = ?')
			.get(user, week) as { content: string } | undefined
	)?.content;

describe('0060, three lines becoming one note', () => {
	test('three lines become three paragraphs, in the order they were written', () => {
		expect(noteFor('u1', '2026-08-31')).toBe('shipped the thing\n\nslept badly\n\nearlier nights');
	});

	test('a week with one line keeps it, unchanged', () => {
		expect(noteFor('u1', '2026-08-24')).toBe('quiet week');
	});

	test('a week whose lines started at two is not thrown away', () => {
		expect(noteFor('u1', '2026-08-17')).toBe('the roof leaked\n\ncall somebody about it');
	});

	test('another account keeps its own', () => {
		expect(noteFor('u2', '2026-08-31')).toBe('mine, not theirs');
	});

	test('nothing is left above position one', () => {
		const left = after.prepare('select count(*) as n from weekly_reviews where position > 1').get();
		expect((left as { n: number }).n).toBe(0);
	});

	test('and no week lost its review entirely', () => {
		const weeks = after.prepare('select count(*) as n from weekly_reviews').get() as { n: number };
		expect(weeks.n).toBe(4);
	});
});
