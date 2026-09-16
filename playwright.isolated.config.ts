import { defineConfig } from '@playwright/test';

/**
 * The isolated instance, tested as the thing it actually is.
 *
 * The main suite runs the server build and reaches isolated mode through the
 * `?isolated` switch, SSR and all — useful, but a hybrid. This config builds
 * the real artefact: static files, `PUBLIC_ONTOPLANO_ISOLATED` baked in, served
 * by nothing smarter than a file server with an SPA fallback, exactly the
 * contract Capacitor honours. No accounts exist, because no server does.
 */
export default defineConfig({
	testDir: 'e2e-isolated',
	testMatch: '**/*.e2e.{ts,js}',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: 'http://localhost:4180',
		/*
		 * The same clock the other suite pins, and for a sharper reason here.
		 *
		 * On a device instance there is no server: the account's timezone is
		 * whatever the browser reports, so an unpinned zone means the app
		 * writes wall-clock times in the machine's zone and a test computing
		 * instants in another gets a different answer on every laptop. The main
		 * config has always pinned this; this one did not, so the same test
		 * passed under one and failed under the other.
		 */
		timezoneId: 'UTC',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'make -s isolated && node scripts/serve-isolated.mjs',
		port: 4180,
		reuseExistingServer: false,
		timeout: 300_000
	}
});
