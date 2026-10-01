import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A press on a tab or a room is answered before the page has loaded.
 *
 * The old screen used to stand, unchanged, until the new one's data arrived —
 * on a phone, a second of the app looking as though it had not heard. Now the
 * tab is current from the press and the screen under it is the shape of what
 * is coming (`PendingPage`), for a tab inside a room and for a change of room.
 */
test.describe('a navigation that takes a while', () => {
	for (const [name, size] of [
		['phone', { width: 390, height: 844 }],
		['desk', { width: 1400, height: 900 }]
	] as const)
		test(`shows where it is going at once (${name})`, async ({ page }) => {
			test.setTimeout(180_000);
			await page.setViewportSize(size);
			await register(page, testEmail(`nav-pending-${name}`));
			await visit(page, '/tasks/todo');

			await page.route(/__data\.json/, async (route) => {
				await new Promise((done) => setTimeout(done, 2000));
				await route.continue();
			});

			const board = page.getByRole('link', { name: 'Board' }).first();
			await board.click();
			await expect(board).toHaveAttribute('aria-current', 'page', { timeout: 500 });
			await expect(page.locator('.pending-page')).toBeVisible({ timeout: 1000 });
			await page.waitForURL('**/tasks/board');
			await expect(page.locator('.pending-page')).toHaveCount(0);

			await page.evaluate(() =>
				[...document.querySelectorAll('a')]
					.find((a) => a.getAttribute('href') === '/notebooks')
					?.click()
			);
			await expect(page.locator('.pending-page')).toContainText('Notebooks', { timeout: 1000 });
			await page.waitForURL('**/notebooks');
			await expect(page.locator('.pending-page')).toHaveCount(0);
		});
});
