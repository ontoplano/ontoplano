import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The pages the service worker keeps for reading offline.
 *
 * It fetches the shopping list and the recipes when it installs, and that is
 * usually on the sign-in screen — where both are a redirect to it. A fetch
 * follows redirects, so the sign-in page was stored under the shopping list's
 * address. Answered with that, opening the list after signing in could fail
 * outright with a network error — Chrome does not accept a redirect's response
 * as the answer to a navigation.
 */
const KEPT = ['/inventory/stock', '/health/recipes'];

test('a page reached through a redirect is not kept as the page asked for', async ({ page }) => {
	await visit(page, '/login');
	await page.evaluate(() => navigator.serviceWorker.ready);

	const kept = await page.evaluate(async (paths) => {
		const found: string[] = [];
		for (const name of await caches.keys()) {
			const cache = await caches.open(name);
			for (const path of paths) {
				const hit = await cache.match(path);
				if (hit?.redirected) found.push(`${path} → ${hit.url}`);
			}
		}
		return found;
	}, KEPT);
	expect(kept).toEqual([]);

	await register(page, testEmail('offline-pages'));
	const response = await visit(page, '/inventory');
	expect(response?.ok()).toBe(true);
	await expect(page).toHaveURL(/\/inventory\/stock/);
	// The list itself, rather than whatever page the redirect had landed on.
	await expect(page.getByRole('button', { name: 'Categories' })).toBeVisible();
});
