import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The planner fetches the windows either side before anybody asks for them.
 *
 * Every arrow is a navigation and a navigation was a round trip, so the grid
 * sat empty for the length of one each time somebody stepped a day. What is
 * checked here is that the fetching happens at all — that the next window, the
 * previous one, and the days either side are asked for while nobody is
 * pressing anything. Whether a particular press then skips the network is
 * SvelteKit's own caching, and asserting on its timing makes a flaky test.
 */
test('the windows either side are fetched before they are asked for', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('planner-preload'));

	const asked = new Set<string>();
	page.on('request', (r) => {
		const url = new URL(r.url());
		if (url.pathname.includes('/tasks/plan')) {
			const from = url.searchParams.get('from');
			if (from) asked.add(from);
		}
	});

	await visit(page, '/tasks/plan?view=week&from=2026-09-21');
	await expect(page.locator('[data-tour="plan-week-start"]').first()).toBeVisible({
		timeout: 30_000
	});
	await page.waitForTimeout(6000);

	// A whole span each way, and the days the shift arrows walk through.
	for (const from of ['2026-09-28', '2026-09-14', '2026-09-22', '2026-09-20'])
		expect([...asked]).toContain(from);

	// And not the month view's worth: four days out is where it stops.
	expect([...asked]).not.toContain('2026-09-26');
});
