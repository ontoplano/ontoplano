/**
 * Prepare the throwaway database and instance config, before the server starts.
 *
 * This used to be Playwright's `globalSetup`, which runs *after* the web server
 * — so the server opened the previous run's file, `globalSetup` then deleted it
 * and built a new one, and the run wrote to an unlinked inode. Everything
 * passed, the file on disk stayed empty, and the schema survived only because
 * each run inherited the last one's deleted database.
 *
 * Running it as the first step of the server command puts it back in the right
 * order: prepare, then start, then test.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const db = process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db');
const configDir = process.env.ONTOPLANO_CONFIG_DIR ?? join(tmpdir(), 'ontoplano-e2e-config');

for (const suffix of ['', '-wal', '-shm']) rmSync(`${db}${suffix}`, { force: true });

execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
	env: { ...process.env, DATABASE_URL: db },
	stdio: 'ignore'
});

// Registration is closed by default, and every test makes an account.
rmSync(configDir, { recursive: true, force: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(
	join(configDir, 'config.toml'),
	'[server]\nhost = "0.0.0.0"\nport = "4173"\n\n[database]\n\n[week]\nfirst_day = "0"\ngenerate_day = "6"\n\n[registration]\nmode = "open"\n'
);

console.log(`e2e: fresh database at ${db}, config in ${configDir}`);
