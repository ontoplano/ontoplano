import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A press on a tab or a room is answered before the page has loaded.
 *
 * The old screen used to stand, unchanged, until the new one's data arrived —
 * on a phone, a second of the app looking as though it had not heard. Now the
 * tab is current from the press and the screen under it is the shape of what
 * is coming (`PendingPage`), for a tab inside a room and for a change of room —
 * where the room's header is drawn whole, the shape it will have.
 */
test.describe('a navigation that takes a while', () => {
	// The production build's service worker makes the data requests itself,
	// and `page.route` never sees those — the delay below would not apply.
	test.use({ serviceWorkers: 'block' });

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
			// The room's own header, not a stand-in for it: its bar, with its
			// tabs and the one being gone to current, where the room will draw it.
			const pending = page.locator('.pending-page .room-bar');
			await expect(pending.locator('h1')).toHaveText('Notebooks');
			await expect(pending.locator('[aria-current="page"]')).toContainText('Notebooks');
			await expect(pending.getByText('Diary')).toBeVisible();
			const before = await pending.boundingBox();
			await page.waitForURL('**/notebooks');
			await expect(page.locator('.pending-page')).toHaveCount(0);
			const after = await page.locator('.room-bar').first().boundingBox();
			expect(Math.round(after!.y)).toBe(Math.round(before!.y));
			expect(Math.round(after!.height)).toBe(Math.round(before!.height));
		});
});
