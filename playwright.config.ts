import { defineConfig } from '@playwright/test';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The tests get their own database.
 *
 * Without this the suite booted against `~/.local/share/ontoplano/ontoplano.db`
 * — a real one, on whichever machine ran it. `globalSetup` creates the schema in
 * a throwaway file and the server is pointed at it.
 */
const TEST_DB = process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db');

export default defineConfig({
	globalSetup: './e2e/setup.ts',
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		env: {
			DATABASE_URL: TEST_DB,
			ORIGIN: 'http://localhost:4173',
			BETTER_AUTH_SECRET: 'playwright-secret-playwright-secret',
			// Keep the tests off whatever the developer's own config says.
			XDG_CONFIG_HOME: join(homedir(), '.config')
		}
	},
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});
