/**
 * Story 5.4 — the money model on the served instance.
 *
 * Seeds every fixture case through the real screens while a synthetic account
 * is registered, then asks the four questions on `/finance` at 1280px and
 * 390px. Parity across surfaces is served-only: the same month's figures are
 * compared between the UI, `GET /api/v1/finance/summary` and the MCP `summary`
 * tool on the same frozen tree.
 */
import { test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { assertServedParity, financeModelJourney } from './helpers/finance-model';

for (const width of [1280, 390]) {
	test(`the fixture money model answers the four questions at ${width}px`, async ({ page }) => {
		test.setTimeout(300_000);
		await page.setViewportSize({ width, height: 900 });
		await register(page, testEmail(`finance-model-${width}`));
		await financeModelJourney(page);
		// Served-only: one month, one object through UI, REST and MCP.
		await assertServedParity(page);
	});
}
