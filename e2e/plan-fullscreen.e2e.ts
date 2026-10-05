import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/** The plan, on the whole screen: its controls and its grid, and back. */
test('the plan goes full screen and comes back', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	await register(page, testEmail('plan-full'));
	await visit(page, '/tasks/plan');

	await page.getByRole('button', { name: 'Full screen' }).click();
	await expect
		.poll(() => page.evaluate(() => document.fullscreenElement?.className ?? ''))
		.toContain('plan-surface');
	await expect(page.locator('.plan-surface .plan-grid')).toBeVisible();
	await page.screenshot({ path: 'test-results/plan-fullscreen.png' });

	await page.getByRole('button', { name: 'Leave full screen' }).click();
	await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
