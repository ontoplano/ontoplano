/**
 * The config file never writes down a database path it was handed.
 *
 * This is the bug that served production the demo's database. The demo unit
 * sets `DATABASE_URL` and — until it was fixed — no `ONTOPLANO_CONFIG_DIR`, so
 * both instances read and wrote one `config.toml`. The app tops that file up
 * with the settings in force whenever it finds a key missing, which wrote
 * `path = …/ontoplano-demo/demo.db` into production's config. Production
 * restarted, opened the demo's database, and refused every sign-in and every
 * API token while the real data sat untouched beside it.
 *
 * Two things had to be true for that, and this holds the one that lives in the
 * app: a path that came from the environment belongs to a process, not to an
 * instance, and is never written down. A path somebody typed into the file is
 * the instance saying where its database is, and stays.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'ontoplano-config-path-'));
	process.env.ONTOPLANO_CONFIG_DIR = dir;
	vi.resetModules();
});

afterEach(() => {
	delete process.env.DATABASE_URL;
	delete process.env.ONTOPLANO_CONFIG_DIR;
	rmSync(dir, { recursive: true, force: true });
});

const file = () => readFileSync(join(dir, 'config.toml'), 'utf8');

describe('a database path in the environment', () => {
	test('is used, and never written into the config file', async () => {
		process.env.DATABASE_URL = '/somewhere/else/demo.db';

		const config = await import('../src/lib/server/config');
		config.ensureConfig();
		// A key is missing, so the file is topped up — the moment the old code
		// wrote the path in.
		writeFileSync(join(dir, 'config.toml'), '[server]\nhost = "127.0.0.1"\n');
		const loaded = config.loadConfig();

		// The process still opens the database it was told to.
		expect(loaded.database.path).toBe('/somewhere/else/demo.db');
		// And the file says nothing about it.
		expect(file()).not.toContain('demo.db');
		expect(file()).not.toMatch(/^path =/m);
	});
});

describe('a database path written in the file', () => {
	test('stays there, because that is the instance saying where it lives', async () => {
		writeFileSync(join(dir, 'config.toml'), '[database]\npath = "/srv/ontoplano/real.db"\n');

		const config = await import('../src/lib/server/config');
		const loaded = config.loadConfig();

		expect(loaded.database.path).toBe('/srv/ontoplano/real.db');
		expect(file()).toContain('/srv/ontoplano/real.db');
	});

	test('and the environment wins for this process without rewriting it', async () => {
		writeFileSync(join(dir, 'config.toml'), '[database]\npath = "/srv/ontoplano/real.db"\n');
		process.env.DATABASE_URL = '/somewhere/else/demo.db';

		const config = await import('../src/lib/server/config');
		expect(config.loadConfig().database.path).toBe('/somewhere/else/demo.db');

		// The file still names the instance's own database, not this process's.
		expect(file()).toContain('/srv/ontoplano/real.db');
		expect(file()).not.toContain('demo.db');
	});
});
