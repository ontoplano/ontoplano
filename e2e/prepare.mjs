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

/*
 * And something for the administration page's "Blocked" card to read.
 *
 * The real file is fail2ban's, which a test machine has no reason to have and
 * no right to write. The app takes the path from the environment for exactly
 * this: it is the same reader, pointed somewhere harmless.
 */
const stamp = new Date();
const pad = (n) => String(n).padStart(2, '0');
const at = (minutes) => {
	const d = new Date(stamp.getTime() - minutes * 60_000);
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
};
writeFileSync(
	process.env.ONTOPLANO_FAIL2BAN_LOG ?? join(tmpdir(), 'ontoplano-e2e-fail2ban.log'),
	[
		`${at(6)},123 fail2ban.actions        [1234]: NOTICE  [ontoplano-web] Ban 203.0.113.7`,
		`${at(40)},123 fail2ban.actions        [1234]: NOTICE  [sshd] Ban 198.51.100.3`,
		''
	].join('\n')
);

console.log(`e2e: fresh database at ${db}, config in ${configDir}`);
