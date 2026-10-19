import { test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { insightsJourney } from './helpers/finance-insights';
for (const width of [1200, 390]) {
	test(`honest monthly spending and exclusions at ${width}px`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height: 900 });
		await register(page, testEmail(`finance-insights-${width}`));
		await insightsJourney(page);
	});
}
