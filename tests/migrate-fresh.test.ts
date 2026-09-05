import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The very first `make dev` on a fresh machine: nothing under
 * ~/.local/share/ontoplano exists yet, and better-sqlite3 refuses to create a
 * database inside a directory that does not exist — so the migrator, which is
 * the first thing every path runs, owns making the directory.
 */
describe('migrating on a fresh machine', () => {
	it('creates the data directory instead of crashing', () => {
		const dir = mkdtempSync(join(tmpdir(), 'onto-fresh-'));
		const dataDir = join(dir, 'not', 'yet', 'made');
		try {
			const env = { ...process.env, ONTOPLANO_DATA_DIR: dataDir };
			delete env.DATABASE_URL;
			execFileSync(process.execPath, ['scripts/migrate.mjs'], { env, stdio: 'pipe' });
			expect(existsSync(join(dataDir, 'ontoplano.db'))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
