/**
 * The diary gets its own count, and what was already written keeps pointing.
 *
 * `seq` numbers everything an account writes, notebook notes included, so the
 * thirtieth diary entry was headed `#127` — a number nobody arrives at by
 * counting. `0094` gives the diary a number of its own, which renumbers every
 * entry, which means every `#12` already written in the diary now names a
 * different entry than it did. The data step rewrites them, and this is the
 * test that the rewrite hits references and nothing else: not `#30` when it
 * meant `#3`, not a number belonging to no entry, not a `#12` glued to a word.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { installMigrator } from './helpers/migrator';

const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-diary-numbers-'));
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

/** One entry, by the account-wide number it was written with. */
const entry = (seq: number) =>
	after
		.prepare('select diary_seq as n, content from diary_entries where user_id = ? and seq = ?')
		.get('u1', seq) as { n: number | null; content: string };

beforeAll(() => {
	installMigrator(work);

	const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
	const at = journal.entries.findIndex((e: { tag: string }) => e.tag.startsWith('0094_'));
	writeFileSync(JOURNAL, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }));
	migrate();

	const before = new Database(dbPath);
	before.exec(`
		insert into user (id, name, email) values ('u1','Me','me@test.invalid');
		insert into user (id, name, email) values ('u2','You','you@test.invalid');
		insert into notebooks (user_id, title) values ('u1','Kitchen');

		-- Diary, note, diary, note, diary: the diary numbers become 1, 2, 3
		-- where the account-wide numbers are 1, 3, 5.
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u1',1,null,null,'the first thing');
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u1',2,1,1,'a kitchen note, which mentions #1 and #30');
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u1',3,null,null,'see #1, and #300, and x#1');
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u1',4,1,2,'another kitchen note');
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u1',5,null,null,'refers to #3 and (#1) and #5');

		-- Another account, to prove the numbering is the account's.
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u2',1,null,null,'theirs');
		insert into diary_entries (user_id, seq, notebook_id, notebook_seq, content)
			values ('u2',2,null,null,'theirs too, about #1');
	`);
	before.close();

	// The journal back in full, so this run carries 0094 and its data step.
	writeFileSync(JOURNAL, readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8'));
	migrate();
	after = new Database(dbPath);
});

describe('giving the diary its own number', () => {
	test('numbers the diary from one, skipping notes in notebooks', () => {
		expect([entry(1).n, entry(3).n, entry(5).n]).toEqual([1, 2, 3]);
		expect([entry(2).n, entry(4).n]).toEqual([null, null]);
	});

	test('starts again for another account', () => {
		const theirs = after
			.prepare('select seq, diary_seq as n from diary_entries where user_id = ? order by seq')
			.all('u2') as { seq: number; n: number }[];
		expect(theirs.map((r) => r.n)).toEqual([1, 2]);
	});

	test('remembers the highest number handed out, so none is reused', () => {
		const mark = after
			.prepare("select value from user_settings where user_id = ? and key = 'diary.number.highest'")
			.get('u1') as { value: string };
		expect(mark.value).toBe('3');
	});

	test('rewrites references in the diary to the numbers they meant', () => {
		// `#3` was the entry now numbered 2; `#5` is now 3; `#1` is unchanged.
		expect(entry(5).content).toBe('refers to #2 and (#1) and #3');
	});

	test('leaves alone a number that names no entry, and one inside a word', () => {
		expect(entry(3).content).toBe('see #1, and #300, and x#1');
	});

	test('does not touch writing filed in a notebook', () => {
		// `#30` there would be mangled by a literal replace of `#3`.
		expect(entry(2).content).toBe('a kitchen note, which mentions #1 and #30');
	});

	test('runs once, so a second migrate does not renumber the references again', () => {
		after.close();
		migrate();
		after = new Database(dbPath);
		expect(entry(5).content).toBe('refers to #2 and (#1) and #3');
	});
});
