import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/** The plan, on the whole screen: its controls and its grid, and back. */
test('the plan goes full screen and comes back', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	await register(page, testEmail('plan-full'));
	await visit(page, '/tasks/calendar');

	await page.getByRole('button', { name: 'Full screen' }).click();
	await expect
		.poll(() => page.evaluate(() => document.fullscreenElement?.className ?? ''))
		.toContain('plan-surface');
	await expect(page.locator('.plan-surface .plan-grid')).toBeVisible();
	const main = page.locator('.plan-surface .ec-main');
	const header = main.locator('.ec-header');
	const before = await header.boundingBox();
	await main.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
	await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	const after = await header.boundingBox();
	expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
	expect(await page.locator('.plan-surface').evaluate((el) => el.scrollTop)).toBe(0);
	await page.screenshot({ path: 'test-results/plan-fullscreen.png' });

	await page.getByRole('button', { name: 'Leave full screen' }).click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
