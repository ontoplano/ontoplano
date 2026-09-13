/**
 * `make reset-dev` will not throw away somebody's data.
 *
 * It deletes a database and everything beside it. On a server that is the live
 * one: gone, along with the copies of it, replaced by an empty one seeded with
 * invented data and an operator account whose password is written in the
 * Makefile. It used to move the file aside rather than delete it, which made
 * that recoverable; it is not any more, which is why the check comes first.
 *
 * The check is "does this database hold an account that is not the dev one",
 * because the only database this is for is the one the project seeds, and that
 * one has exactly `dev@ontoplano.test`.
 */
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'ontoplano-reset-dev-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** What the guard prints: a count, and never an address. */
function strangers(path: string): string {
	return execFileSync('node', ['scripts/strangers-in-the-db.mjs', path], {
		cwd: ROOT,
		encoding: 'utf8'
	}).trim();
}

function withAccounts(name: string, emails: string[]): string {
	const path = join(work, name);
	const db = new Database(path);
	db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL)');
	const add = db.prepare('INSERT INTO user (id, email) VALUES (?, ?)');
	emails.forEach((email, i) => add.run(String(i), email));
	db.close();
	return path;
}

describe('counting who is in a database', () => {
	test('a database that is not there is nothing to lose', () => {
		expect(strangers(join(work, 'never-existed.db'))).toBe('0');
	});

	test('one that has never been used is nothing to lose either', () => {
		const path = join(work, 'empty.db');
		new Database(path).close();
		expect(strangers(path)).toBe('0');
	});

	test('the seeded dev database is the one this command is for', () => {
		expect(strangers(withAccounts('dev.db', ['dev@ontoplano.test']))).toBe('0');
	});

	test('anything else is somebody, and is counted', () => {
		expect(strangers(withAccounts('one.db', ['someone@example.test']))).toBe('1');
		expect(
			strangers(withAccounts('many.db', ['dev@ontoplano.test', 'a@example.test', 'b@example.test']))
		).toBe('2');
	});

	/** A count, so that saying "do not touch this" never means reading it out. */
	test('it answers with a number and nothing else', () => {
		const out = strangers(withAccounts('quiet.db', ['someone@example.test']));
		expect(out).toMatch(/^\d+$/);
		expect(out).not.toContain('@');
	});
});

describe('the command itself', () => {
	test('refuses a database holding accounts that are not the dev one', () => {
		const path = withAccounts('live.db', ['a@example.test']);
		let failed = false;
		let said = '';
		try {
			execFileSync('make', ['reset-dev', `DATABASE_URL=${path}`], {
				cwd: ROOT,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			});
		} catch (e) {
			failed = true;
			said = String((e as { stdout?: string }).stdout ?? '');
		}

		expect(failed, 'reset-dev did not refuse a database with somebody in it').toBe(true);
		expect(said).toContain('account(s) that are not the dev one');
		// And it says how to mean it anyway, rather than only saying no.
		expect(said).toContain('RESET_DEV_ANYWAY=1');

		// Untouched, and still there: this deletes the file, so refusing has to
		// happen before anything is removed.
		expect(strangers(path)).toBe('1');
	});
});
