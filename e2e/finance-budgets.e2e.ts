import { test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { budgetJourney } from './helpers/finance-budgets';
for (const width of [1200, 390]) {
	test(`monthly budgets, credits, copy and safe removal at ${width}px`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height: 900 });
		await register(page, testEmail(`finance-budgets-${width}`));
		await budgetJourney(page);
	});
}
