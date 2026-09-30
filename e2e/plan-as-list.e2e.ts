import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The plan as a list of its days, in any view — and the calendar by default.
 *
 * A phone's week used to be the list and nothing else, with no way to see the
 * grid; now the calendar is what every width opens on, and the button beside
 * the views (or `a`) reads the same day, week or month as a list.
 */

for (const [name, width] of [
	['phone', 390],
	['desktop', 1400]
] as const) {
	test(`${name}: the calendar by default, a list on request`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await register(page, testEmail(`plan-list-${name}`));

		await visit(page, '/tasks/plan?view=week');
		await expect(page.locator('.plan-agenda')).toHaveCount(0);
		await expect(page.locator('.ec')).toBeVisible();

		await page.getByRole('button', { name: /show as a list/i }).click();
		await expect(page).toHaveURL(/view=week&as=list/);
		await expect(page.locator('.plan-agenda section')).toHaveCount(7);

		// Changing view keeps it a list; a month's list is the month's own days.
		await page.getByRole('button', { name: 'Month', exact: true }).click();
		await expect(page).toHaveURL(/view=month.*as=list/);
		const days = await page.locator('.plan-agenda section').count();
		expect(days).toBeGreaterThanOrEqual(28);
		expect(days).toBeLessThanOrEqual(31);

		await page.getByRole('button', { name: /show as the calendar/i }).click();
		await expect(page).not.toHaveURL(/as=list/);
		await expect(page.locator('.plan-agenda')).toHaveCount(0);

		// The toolbar fits the screen it is on.
		const row = page.locator('.plan-view-controls');
		const fits = await row.evaluate((el) => el.scrollWidth <= el.clientWidth);
		expect(fits).toBe(true);
	});
}
