import type { PlaywrightTestConfig } from '@playwright/test';

export const DEVICE_TEST_TIMEOUT = 60_000;

// The bundled headless shell crashes while opening new contexts on both local
// Linux and CI. Use Playwright's full Chromium in headless mode instead.
export const chromiumBrowser = { channel: 'chromium' as const };

/** A missing control fails promptly, even inside a longer workflow. */
export const browserChecks = {
	forbidOnly: !!process.env.CI,
	retries: 0,
	// A broken shared fixture should not burn the whole shard's time budget.
	maxFailures: process.env.CI ? 3 : 0,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	reporter: [
		['list'],
		['html', { open: 'never' }],
		['json', { outputFile: 'test-results/timings.json' }]
	],
	use: {
		actionTimeout: 10_000,
		navigationTimeout: 20_000,
		timezoneId: 'UTC',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	}
} satisfies PlaywrightTestConfig;
