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
		/*
		 * Node by default; a browser only where a test needs one.
		 *
		 * Most of what is worth testing here is server code, and a DOM for all of
		 * it would be a second or two on every run for nothing. The handful of
		 * client modules that ARE worth testing — the autofill suppression above
		 * all, which has now been "fixed" three times — say so with a
		 * `@vitest-environment happy-dom` docblock at the top of the file.
		 */
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
			ONTOPLANO_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'ontoplano-test-config-')),

			/*
			 * The suite runs in UTC, wherever the machine is.
			 *
			 * The app deals in two kinds of value on purpose: instants, which
			 * are UTC, and wall-clock values, which are naive and resolved
			 * against the account's zone. A test writes both — `ctx.now` is an
			 * instant, a day boundary is wall-clock — and `new Date('…T08:00:00')`
			 * means "08:00 wherever this machine is". In UTC the two conventions
			 * happen to agree, so the suite passed here and one reminders test
			 * failed on a laptop in São Paulo: `dueReminders` correctly resolved
			 * an 11:00 UTC instant into 11:00 for a `tz: 'UTC'` account, and two
			 * reminders set for 08:30 were duly overdue.
			 *
			 * That was the test being ambiguous, not the app being wrong — so
			 * the fix is to remove the ambiguity rather than to loosen the
			 * assertion. Testing the app *across* zones is a different job, and
			 * one worth doing deliberately with explicit instants.
			 */
			TZ: 'UTC'
		},

		/*
		 * A number, so "did the fix come with a test" stops being discipline.
		 *
		 * `yarn test:coverage` prints a table and writes `coverage/`. The
		 * thresholds are the floor, not the target: they are set a little under
		 * where the suite is today, so the build fails when a change *lowers*
		 * coverage and nobody has to argue about whether 71% is good.
		 * Raise them when a sweep raises the real number — never lower them to
		 * make a red build green.
		 *
		 * Rules and services only. Route files and components are exercised by
		 * Playwright, which this provider cannot see, so counting them here
		 * would report a low number about code that is in fact well covered —
		 * a number that lies is worse than no number.
		 */
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'html', 'json-summary'],
			reportsDirectory: 'coverage',
			include: ['src/lib/**/*.ts'],
			exclude: [
				'**/*.test.ts',
				'**/*.d.ts',
				// Schema and migrations describe shape; there is nothing to cover.
				'src/lib/server/db/**',
				// Wired at boot and driven by the e2e suite, not by unit tests.
				'src/lib/server/auth.ts'
			],
			// Today's numbers, rounded down a little. A ratchet, not a wish:
			// raise them when a sweep raises the real figure, and never lower
			// them to turn a red build green — the point is to notice the change
			// that took cover away, on the day it happens.
			//
			// 30 Aug: 45.9% → 81.1% lines, after covering the services that had
			// nothing, then the planner arithmetic and the client modules worth
			// testing. Six real bugs fell out of writing them, which is the
			// argument for the number going up rather than the number itself.
			//
			// What is deliberately still low: billing.ts (checked against Paddle
			// fixtures by scripts/check-billing.ts, which this provider cannot
			// see) and email.ts (SMTP). Covering those here would mean mocking
			// the two things whose real behaviour is the entire question.
			thresholds: { lines: 80, functions: 83, statements: 77, branches: 64 }
		}
	}
});
