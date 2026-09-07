import { defineConfig } from '@playwright/test';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The tests get their own database.
 *
 * Without this the suite booted against `~/.local/share/ontoplano/ontoplano.db`
 * — a real one, on whichever machine ran it. `e2e/prepare.mjs` creates the
 * schema in a throwaway file and the server is pointed at it.
 */
const TEST_DB = process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db');

/**
 * And their own instance config.
 *
 * Registration is closed by default, so a suite that reads the developer's
 * config file would pass or fail on what that file happens to say.
 * `e2e/prepare.mjs` writes an open one here.
 */
export const TEST_CONFIG_DIR =
	process.env.PLAYWRIGHT_CONFIG_DIR ?? join(tmpdir(), 'ontoplano-e2e-config');

export default defineConfig({
	webServer: {
		// The preparation is part of the command on purpose: `globalSetup` runs
		// after the server, which meant the server opened the database that was
		// about to be deleted. See `e2e/prepare.mjs`.
		command: 'node e2e/prepare.mjs && npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		env: {
			DATABASE_URL: TEST_DB,
			ORIGIN: 'http://localhost:4173',
			BETTER_AUTH_SECRET: 'playwright-secret-playwright-secret',
			// Keep the tests off whatever the developer's own config says.
			ONTOPLANO_CONFIG_DIR: TEST_CONFIG_DIR,
			// The instance-owner pages only exist on a self-hosted instance, and
			// they are part of what the suite checks.
			ONTOPLANO_SELF_HOST: 'true',
			// adapter-node's default is smaller than the pictures this app
			// accepts, and the app refuses to start when the two disagree — the
			// suite runs the real built server, so it needs the real setting.
			BODY_SIZE_LIMIT: '12M',
			// So a test can present itself as a distinct client and not spend the
			// whole suite's share of the sign-in rate limit.
			ONTOPLANO_TRUST_PROXY: 'true',
			// `/healthz` only discloses disk and memory to a probe that knows this.
			ONTOPLANO_HEALTH_TOKEN: 'playwright-health-token',
			XDG_CONFIG_HOME: join(homedir(), '.config'),
			// The administration page reads fail2ban's log; `e2e/prepare.mjs`
			// writes this one, so the test does not need the real thing.
			ONTOPLANO_FAIL2BAN_LOG: join(tmpdir(), 'ontoplano-e2e-fail2ban.log'),
			// The server runs in UTC for the same reason the unit suite does:
			// otherwise "today" is a different day here and on a laptop three
			// hours west, and a failure means the machine rather than the code.
			TZ: 'UTC'
		}
	},
	// The browser keeps the server's clock, for the same reason the server is
	// pinned to UTC above. Left on the machine's own timezone, a browser three
	// hours west computes a "today" the server calls yesterday, and anything
	// planned for today lands outside the window the plan draws — a suite that
	// passes all day and fails after 21:00.
	use: { baseURL: 'http://localhost:4173', timezoneId: 'UTC' },
	testMatch: '**/*.e2e.{ts,js}',

	/*
	 * The registration tests go last, on their own.
	 *
	 * They change an instance-wide setting — who may create an account — by
	 * rewriting the config file the server reads. Every other test registers
	 * one, so the two cannot overlap: this makes "everything else" a project
	 * that must finish first.
	 */
	projects: [
		{ name: 'app', testIgnore: '**/{registration,admin}.e2e.ts' },
		// The administrator is the oldest account, so this cannot run until
		// something has made accounts.
		{ name: 'admin', testMatch: '**/admin.e2e.ts', dependencies: ['app'] },
		{ name: 'registration', testMatch: '**/registration.e2e.ts', dependencies: ['app', 'admin'] }
	]
});
