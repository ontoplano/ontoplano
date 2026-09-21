import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Stepping the week does not throw you back to seven in the morning.
 *
 * "if i scrolled down, clicking the arrow will scroll me fully back up, since
 * it's kind of reloading the page." It is a navigation, and a navigation
 * scrolls to the top — but nothing above the grid changed, only the grid did.
 */
test('the arrows keep the page where it is', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 800 });
	await register(page, testEmail('plan-hold'));
	await visit(page, '/tasks/plan?view=week');
	await expect(page.locator('[data-tour="plan-grid"]')).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(1500);

	// Down the page, far enough that being thrown to the top is obvious. The
	// grid is 70vh and there is a rail above it, so there is somewhere to go.
	await page.evaluate(() => window.scrollTo(0, 240));
	await page.waitForTimeout(300);
	const pageBefore = await page.evaluate(() => window.scrollY);
	expect(pageBefore).toBeGreaterThan(0);

	await page
		.getByRole('button', { name: /^Forward one/ })
		.first()
		.click();
	await page.waitForURL(/from=/, { timeout: 15_000 });
	await page.waitForTimeout(900);

	/*
	 * The page is still where it was, rather than back at the top.
	 *
	 * Not to the pixel: "· next 7 days" is only said about the current week,
	 * so stepping away from it takes that text off the toolbar and the page
	 * loses the line it was on. What matters is that somebody reading the
	 * afternoon is still reading the afternoon.
	 */
	const after = await page.evaluate(() => window.scrollY);
	expect(Math.abs(after - pageBefore)).toBeLessThanOrEqual(40);
});
