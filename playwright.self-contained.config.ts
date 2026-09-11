import { defineConfig } from '@playwright/test';

/**
 * The self-contained instance, tested as the thing it actually is.
 *
 * The main suite runs the server build and reaches self-contained mode through the
 * `?selfContained` switch, SSR and all — useful, but a hybrid. This config builds
 * the real artefact: static files, `PUBLIC_ONTOPLANO_SELF_CONTAINED` baked in, served
 * by nothing smarter than a file server with an SPA fallback, exactly the
 * contract Capacitor honours. No accounts exist, because no server does.
 */
export default defineConfig({
	testDir: 'e2e-self-contained',
	testMatch: '**/*.e2e.{ts,js}',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: 'http://localhost:4180',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'make -s local && node scripts/serve-self-contained.mjs',
		port: 4180,
		reuseExistingServer: false,
		timeout: 300_000
	}
});
