/**
 * A notebook's place moves out of its name and into its folder.
 *
 * 0105 adds the column and 0106 moves the data: `Home — Kitchen — Countertops`
 * becomes `Countertops` in `Home/Kitchen`. The move is hand-written SQL, so
 * this builds a database as it stood before, fills it with parents and
 * children the way the em-dash naming made them, runs the real migrator, and
 * reads what came out.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { installMigrator } from './helpers/migrator';
import { NOTEBOOK_SEPARATOR, splitLegacyTitle } from '../src/lib/notebook-path';

const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-notebook-folders-'));
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

/** Every title the fixture starts with, so the SQL and the import agree on all of them. */
const TITLES = [
	'Renovation',
	'Renovation — Kitchen',
	'Renovation — Kitchen — Countertops',
	'Trip — 2026 — Lisbon',
	'Reading',
	'Ideas',
	'Work — Ideas',
	'Trip — '
];

let after: Database.Database;

beforeAll(() => {
	installMigrator(work);

	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0105_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid'), ('u2','Them','them@test.invalid');
	`);
	const insert = before.prepare(
		'insert into notebooks (id, user_id, title, description) values (?, ?, ?, ?)'
	);
	TITLES.forEach((title, i) => insert.run(i + 1, 'u1', title, `about ${i + 1}`));
	// Somebody else's notebook with the same name moves on its own account.
	insert.run(100, 'u2', 'Renovation — Kitchen', 'theirs');
	// A note filed in a child, which must still point at it afterwards.
	before.exec(`insert into diary_entries (id, user_id, seq, content, notebook_id)
		values (1, 'u1', 1, 'granite', 3)`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

type Row = { id: number; user_id: string; title: string; folder: string; description: string };
const row = (id: number) =>
	after
		.prepare('select id, user_id, title, folder, description from notebooks where id = ?')
		.get(id) as Row;

describe('0105 and 0106, on a shelf built from em dashes', () => {
	test('a top-level notebook keeps its name and gets no folder', () => {
		expect(row(1)).toMatchObject({ title: 'Renovation', folder: '' });
		expect(row(5)).toMatchObject({ title: 'Reading', folder: '' });
	});

	test("a child's ancestors become its folder, joined with slashes", () => {
		expect(row(2)).toMatchObject({ title: 'Kitchen', folder: 'Renovation' });
		expect(row(3)).toMatchObject({ title: 'Countertops', folder: 'Renovation/Kitchen' });
	});

	test('a missing link in the chain is still a folder segment', () => {
		// There was never a `Trip — 2026` notebook; the folder does not need one.
		expect(row(4)).toMatchObject({ title: 'Lisbon', folder: 'Trip/2026' });
	});

	test('two notebooks with one name in different folders are both kept', () => {
		expect(row(6)).toMatchObject({ title: 'Ideas', folder: '' });
		expect(row(7)).toMatchObject({ title: 'Ideas', folder: 'Work' });
	});

	test('a name whose last segment is blank is left as it was', () => {
		expect(row(8)).toMatchObject({ title: 'Trip — ', folder: '' });
	});

	test('nothing else about a notebook moves, and what is filed in it stays', () => {
		expect(row(3).description).toBe('about 3');
		expect(
			(
				after.prepare('select notebook_id from diary_entries where id = 1').get() as {
					notebook_id: number;
				}
			).notebook_id
		).toBe(3);
	});

	test("each account's notebooks move on their own", () => {
		expect(row(100)).toMatchObject({ user_id: 'u2', title: 'Kitchen', folder: 'Renovation' });
	});

	test('the same answer the importer gives an old export', () => {
		TITLES.forEach((title, i) => {
			const { id, ...moved } = row(i + 1);
			void id;
			expect(splitLegacyTitle(title), title).toEqual({
				title: moved.title,
				folder: moved.folder
			});
		});
		expect(NOTEBOOK_SEPARATOR).toBe(' — ');
	});

	test('the new index refuses a second name in the same folder', () => {
		expect(() =>
			after
				.prepare(
					"insert into notebooks (user_id, title, folder) values ('u1', 'Kitchen', 'Renovation')"
				)
				.run()
		).toThrow(/UNIQUE/);
	});
});
