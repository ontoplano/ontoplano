/**
 * Story 5.4 — the money model on the shipped static build.
 *
 * The same journey and the same numbers as the served spec, driven through
 * the artefact a phone gets: static files over SQLite-WASM. There is no
 * server in this instance, so UI/API/MCP parity is asserted in the served
 * spec only; here the four questions must render the same synthetic figures
 * at 1280px and 390px.
 */
import { expect, test } from '@playwright/test';
import { financeModelJourney } from '../e2e/helpers/finance-model';

for (const width of [1280, 390]) {
	test(`the shipped money model answers the four questions at ${width}px`, async ({ page }) => {
		test.setTimeout(300_000);
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/');
		const tour = page.getByRole('dialog', { name: 'Tutorial' });
		await expect(tour).toBeVisible({ timeout: 20_000 });
		await tour.getByRole('button', { name: 'Dismiss', exact: true }).click();
		await financeModelJourney(page);
	});
}
