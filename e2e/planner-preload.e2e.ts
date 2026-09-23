import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The planner has the next window before the arrow is pressed.
 *
 * Every arrow is a navigation and a navigation was a round trip, so the grid
 * sat empty for the length of one each time somebody stepped a day. The first
 * attempt at this fetched eight windows — both arrows and three days either
 * side — and helped with none of them: SvelteKit remembers exactly one
 * preloaded route, discarded the moment a different one is preloaded, so all
 * eight requests left only the last, which no arrow goes to.
 *
 * One slot, so one guess. What is checked here is the thing that was actually
 * broken: pressing the arrow does not fetch the window it lands on, because
 * that window was already asked for.
 */
test('stepping forward does not fetch the window it lands on', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('planner-preload'));

	let asked: string[] = [];
	page.on('request', (r) => {
		const url = new URL(r.url());
		if (!url.pathname.includes('/tasks/plan')) return;
		const from = url.searchParams.get('from');
		if (from) asked.push(from);
	});

	await visit(page, '/tasks/plan?view=week&from=2026-09-21');
	await expect(page.locator('[data-tour="plan-week-start"]').first()).toBeVisible({
		timeout: 30_000
	});
	await page.waitForTimeout(4000);

	// The window forward, asked for while nobody is pressing anything.
	expect(asked).toContain('2026-09-28');

	// A hand arriving on the arrow, which is the moment the target is known
	// rather than guessed, and then the press.
	const forward = page.getByRole('button', { name: /^Forward one/ }).first();
	await forward.hover();
	await page.waitForTimeout(400);

	asked = [];
	await forward.click();
	await page.waitForURL(/from=2026-09-28/, { timeout: 15_000 });
	await page.waitForTimeout(400);

	// The press itself did not go and get it.
	expect(asked).not.toContain('2026-09-28');
});
