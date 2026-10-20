import { expect, test } from '@playwright/test';
import { insightsJourney } from '../e2e/helpers/finance-insights';
for (const width of [1200, 390]) {
	test(`honest monthly spending persists on device at ${width}px`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/');
		const tutorial = page.getByRole('dialog', { name: 'Tutorial' });
		await expect(tutorial).toBeVisible({ timeout: 20_000 });
		await tutorial.getByRole('button', { name: 'Dismiss', exact: true }).click();
		await insightsJourney(page);
	});
}
