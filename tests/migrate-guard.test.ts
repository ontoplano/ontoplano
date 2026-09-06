/**
 * The migrator refuses a database from a different history.
 *
 * A dev database ran a feature branch's migration; the branch's migrations
 * were then renumbered before merging, and the next `make dev` re-ran the
 * same DDL against tables that already existed — dying halfway through a
 * CREATE with a stack trace instead of a sentence. The guard turns that into
 * a refusal BEFORE anything runs: a database holding migration hashes this
 * build has never heard of is named, not migrated. These tests run the real
 * script the way make runs it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'ontoplano-migrate-guard-'));
const db = join(dir, 'guard.db');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run() {
	try {
		const out = execFileSync('node', ['scripts/migrate.mjs'], {
			env: { ...process.env, DATABASE_URL: db },
			encoding: 'utf8'
		});
		return { code: 0, out };
	} catch (e) {
		const err = e as { status: number; stdout: string; stderr: string };
		return { code: err.status, out: `${err.stdout}${err.stderr}` };
	}
}

describe('the stranger-migration guard', () => {
	test('a fresh database migrates, and a second run has nothing to do', () => {
		expect(run().code).toBe(0);
		const again = run();
		expect(again.code).toBe(0);
	});

	test('a database that ran a since-renamed migration is refused, untouched', () => {
		const handle = new Database(db);
		handle
			.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
			.run('f'.repeat(64), 12345);
		const tables = handle
			.prepare("select count(*) as n from sqlite_master where type = 'table'")
			.get() as { n: number };
		handle.close();

		const refused = run();
		expect(refused.code).toBe(1);
		expect(refused.out).toContain('never heard of');
		expect(refused.out).toContain('reset-dev');

		// Nothing ran: the table count is exactly what it was.
		const after = new Database(db);
		expect(
			(
				after.prepare("select count(*) as n from sqlite_master where type = 'table'").get() as {
					n: number;
				}
			).n
		).toBe(tables.n);
		after.close();
	});
});
