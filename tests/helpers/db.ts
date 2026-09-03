/**
 * A real database, thrown away when the file is done.
 *
 * The services are mostly SQL, so testing them against a mock proves the mock
 * works. Each file gets its own SQLite file with the schema pushed into it and
 * two accounts — which also means every test exercises the ownership predicate
 * that keeps one account out of another's rows.
 *
 * `DATABASE_URL` has to be set before anything imports `$lib/server/db`, so
 * this is called at the top of a test file and the services are imported after.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const OWNER = 'user-under-test';
export const STRANGER = 'somebody-else';

export type TestDatabase = {
	path: string;
	remove: () => void;
	/**
	 * A statement run straight against the file.
	 *
	 * For the handful of setups a service deliberately has no method for — a
	 * calendar body that only arrives over the network, a row backdated past
	 * what any caller could ask for. Not a way around the service layer in a
	 * test that is about the service layer.
	 */
	exec: (sql: string, ...args: unknown[]) => void;
	/**
	 * One row back, for a test that has to count what a service will not show.
	 *
	 * `listEntries` deliberately answers with the loose pile and not with what
	 * is filed in a notebook, so a test about an import into a notebook has no
	 * service call that sees it. Reading the table is the honest way to ask.
	 */
	get: (sql: string, ...args: unknown[]) => unknown;
};

export function makeDatabase(): TestDatabase {
	const dir = mkdtempSync(join(tmpdir(), 'ontoplano-test-'));
	const path = join(dir, 'unit.db');

	execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
		env: { ...process.env, DATABASE_URL: path },
		stdio: 'ignore'
	});

	process.env.DATABASE_URL = path;

	return {
		path,
		remove: () => rmSync(dir, { recursive: true, force: true }),
		exec: (sql, ...args) => {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const Database = require('better-sqlite3');
			const db = new Database(path);
			db.prepare(sql).run(...args);
			db.close();
		},
		get: (sql, ...args) => {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const Database = require('better-sqlite3');
			const db = new Database(path);
			const row = db.prepare(sql).get(...args);
			db.close();
			return row;
		}
	};
}

/** The two accounts every service test needs to exist. */
export function seedAccounts(path: string): void {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const Database = require('better-sqlite3');
	const db = new Database(path);
	const insert = db.prepare(
		`insert into user (id, name, email, email_verified, created_at, updated_at)
		 values (?, ?, ?, 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`
	);
	insert.run(OWNER, 'Owner', 'owner@test.invalid');
	insert.run(STRANGER, 'Stranger', 'stranger@test.invalid');
	db.close();
}
