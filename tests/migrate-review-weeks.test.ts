/**
 * 0085: a review's week starts where the account's week starts.
 *
 * Reviews were keyed on the Monday of their week whatever the planner had
 * been told, so a plan beginning on a Saturday and the record of it disagreed
 * about which seven days a Saturday belonged to. The migration moves the rows
 * that already exist, and moving rows by hand is what a test is for: this
 * builds the database as it stood before 0085, fills it the way three
 * different accounts would be filled, runs the real migrator and reads what
 * came out.
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-review-weeks-'));
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

	// Everything up to but not including 0085.
	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0085_'));
	expect(at).toBeGreaterThan(0);
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	/*
	 * Three accounts, because the interesting cases are all about what the
	 * account said its week was:
	 *
	 *  - `sat` starts its week on Saturday (5), which is two days before a
	 *    Monday — the case this migration exists for.
	 *  - `sun` starts on Sunday (6), one day before.
	 *  - `mon` has said nothing, so it keeps Monday and must not move.
	 *
	 * 2026-08-17 and 2026-08-24 are Mondays; 2026-08-15 and 2026-08-22 are the
	 * Saturdays that lead the weeks containing them.
	 */
	before.exec(`
		insert into user (id, name, email) values
			('sat','Sat','sat@test.invalid'),
			('sun','Sun','sun@test.invalid'),
			('mon','Mon','mon@test.invalid');
		insert into user_settings (user_id, key, value) values
			('sat','week.firstDay','5'),
			('sun','week.firstDay','6'),
			('mon','ui.theme','dark');
		insert into weekly_reviews (user_id, week_start, position, content, created_at, updated_at) values
			('sat','2026-08-17',1,'a saturday week','2026-08-24','2026-08-24'),
			('sat','2026-08-24',1,'the next one','2026-08-31','2026-08-31'),
			('sun','2026-08-17',1,'a sunday week','2026-08-24','2026-08-24'),
			('mon','2026-08-17',1,'left alone','2026-08-24','2026-08-24');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

const weeksOf = (user: string) =>
	(
		after
			.prepare(
				'select week_start, content from weekly_reviews where user_id = ? order by week_start'
			)
			.all(user) as { week_start: string; content: string }[]
	).map((r) => [r.week_start, r.content]);

describe('0085', () => {
	test('an account whose week starts on Saturday gets its Saturdays', () => {
		expect(weeksOf('sat')).toEqual([
			['2026-08-15', 'a saturday week'],
			['2026-08-22', 'the next one']
		]);
	});

	test('one day back is one day back', () => {
		expect(weeksOf('sun')).toEqual([['2026-08-16', 'a sunday week']]);
	});

	test('an account that never said anything keeps Monday', () => {
		expect(weeksOf('mon')).toEqual([['2026-08-17', 'left alone']]);
	});

	test('nothing is merged, dropped or invented', () => {
		const total = after.prepare('select count(*) as n from weekly_reviews').get() as { n: number };
		expect(total.n).toBe(4);
	});

	test('the shift is the same for every week an account holds', () => {
		// Two weeks a week apart before, two weeks a week apart after: a shift,
		// not a fold. If it were not constant, consecutive reviews could land on
		// the same key and one would be lost to the unique index.
		const [first, second] = weeksOf('sat').map(([day]) => new Date(day + 'T00:00:00').getTime());
		expect(second - first).toBe(7 * 24 * 60 * 60 * 1000);
	});
});
