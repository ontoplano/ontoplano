/**
 * 0107 adds the table the stars live in, onto a database that already has
 * notebooks — built as it stood before, then taken through the real migrator.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { installMigrator } from './helpers/migrator';

const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-notebook-favourites-'));
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
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0107_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid'), ('u2','Them','them@test.invalid');
		insert into notebooks (id, user_id, title, folder) values (1, 'u1', 'Kitchen', 'Home'), (2, 'u1', 'Reading', '');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
	after.pragma('foreign_keys = ON');
});

describe('0107, the stars on notebooks', () => {
	test('leaves the notebooks as they were, with nothing starred', () => {
		expect(after.prepare('select count(*) as n from notebooks').get()).toEqual({ n: 2 });
		expect(after.prepare('select count(*) as n from notebook_favourites').get()).toEqual({ n: 0 });
	});

	test('one star per reader per notebook, and two readers may star the same one', () => {
		const star = after.prepare(
			'insert into notebook_favourites (user_id, notebook_id) values (?, ?)'
		);
		star.run('u1', 1);
		star.run('u2', 1);
		expect(() => star.run('u1', 1)).toThrow(/UNIQUE/);
	});

	test('deleting a notebook takes its stars with it', () => {
		after.prepare('delete from notebooks where id = 1').run();
		expect(after.prepare('select count(*) as n from notebook_favourites').get()).toEqual({ n: 0 });
	});
});
