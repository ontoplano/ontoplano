import { defineConfig } from '@playwright/test';

/**
 * The local instance, tested as the thing it actually is.
 *
 * The main suite runs the server build and reaches local mode through the
 * `?local` switch, SSR and all — useful, but a hybrid. This config builds
 * the real artefact: static files, `PUBLIC_ONTOPLANO_LOCAL` baked in, served
 * by nothing smarter than a file server with an SPA fallback, exactly the
 * contract Capacitor honours. No accounts exist, because no server does.
 */
export default defineConfig({
	testDir: 'e2e-local',
	testMatch: '**/*.e2e.{ts,js}',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: 'http://localhost:4180',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'make -s local && node scripts/serve-local.mjs',
		port: 4180,
		reuseExistingServer: false,
		timeout: 300_000
	}
});
