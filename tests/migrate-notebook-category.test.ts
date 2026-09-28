/**
 * 0108 gives a notebook a category, onto a database that already has
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
const work = mkdtempSync(join(tmpdir(), 'ontoplano-notebook-category-'));
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
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0108_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid'), ('u2','Them','them@test.invalid');
		insert into notebooks (id, user_id, title, folder) values (1, 'u1', 'Kitchen', 'Home'), (2, 'u1', 'Reading', '');
		insert into categories (id, user_id, name) values (7, 'u1', 'home');
	`);
	before.close();

	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
	after.pragma('foreign_keys = ON');
});

describe('0108, a notebook’s category', () => {
	test('every notebook that was there has none', () => {
		expect(after.prepare('select id, category_id from notebooks order by id').all()).toEqual([
			{ id: 1, category_id: null },
			{ id: 2, category_id: null }
		]);
	});

	test('it points at a category, and nothing else', () => {
		after.prepare('update notebooks set category_id = 7 where id = 1').run();
		expect(() => after.prepare('update notebooks set category_id = 99 where id = 2').run()).toThrow(
			/FOREIGN KEY/
		);
	});
});
