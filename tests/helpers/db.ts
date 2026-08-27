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

export function makeDatabase(): { path: string; remove: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'ontoplano-test-'));
	const path = join(dir, 'unit.db');

	execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
		env: { ...process.env, DATABASE_URL: path },
		stdio: 'ignore'
	});

	process.env.DATABASE_URL = path;
	return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
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
