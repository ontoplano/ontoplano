import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Unit and service tests.
 *
 * Playwright drives the browser and is slow; this is for everything that can be
 * answered without one — the rules in `$lib`, and the services against a real
 * SQLite file. `**\/*.e2e.ts` is excluded so the two suites never try to run
 * each other's tests.
 */
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		exclude: ['**/node_modules/**', '**/*.e2e.ts'],
		environment: 'node',
		globals: false,
		// A self-hosted instance has no plan ceilings, which is what a test wants:
		// otherwise the fourth notebook in a fixture fails on billing rather than
		// on the thing being tested.
		//
		// And the suite gets a config directory of its own: tests that call
		// writeConfig (registration mode, instance settings) would otherwise
		// rewrite the real ~/.config/ontoplano/config.toml — baking the run's
		// temp database path into it, so the next `yarn dev` cannot even open.
		env: {
			ONTOPLANO_SELF_HOST: 'true',
			ONTOPLANO_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'ontoplano-test-config-'))
		}
	}
});
