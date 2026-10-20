import { expect, test } from '@playwright/test';
import { commitmentJourney } from '../e2e/helpers/finance-commitments';

for (const width of [1200, 390]) {
	test(`commitment stocks, allocations and recovery persist on device at ${width}px`, async ({
		page
	}) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/');
		const tour = page.getByRole('dialog', { name: 'Tutorial' });
		await expect(tour).toBeVisible({ timeout: 20_000 });
		await tour.getByRole('button', { name: 'Dismiss', exact: true }).click();
		await commitmentJourney(page);
	});
}
