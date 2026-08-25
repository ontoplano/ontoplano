import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A fresh database for the suite.
 *
 * Deleted and rebuilt every run, so a test can count rows without wondering
 * what the last run left behind.
 */
export default function globalSetup() {
	const db = process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db');

	for (const suffix of ['', '-wal', '-shm']) rmSync(`${db}${suffix}`, { force: true });

	execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
		env: { ...process.env, DATABASE_URL: db },
		stdio: 'ignore'
	});

	process.env.DATABASE_URL = db;
}
