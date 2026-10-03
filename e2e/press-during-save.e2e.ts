import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A press made while an earlier one is still being answered.
 *
 * The list answers a press at once and the server a moment later; anything
 * pressed in between must not undo the first. Putting a task away and then
 * asking for the archived ones before the archive was answered sometimes left
 * the task out of the archive.
 */

/** Hold every form post for a while. */
async function slowPosts(page: Page) {
	await page.route(/\?\//, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await new Promise((done) => setTimeout(done, 1500));
		return route.continue();
	});
}

test('putting a task away and opening the archive at once keeps it put away', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('away-then-archive'));
	await visit(page, '/tasks/todo');
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.locator('#todo-form [name="heading"]').fill('put me away');
	await page.getByRole('button', { name: 'Create task' }).click();
	const row = page.locator('.row-card').filter({ hasText: 'put me away' });
	await expect(row).toBeVisible({ timeout: 30_000 });

	await slowPosts(page);
	await row.getByRole('button', { name: 'Put it away' }).click();
	await expect(row).toHaveCount(0, { timeout: 500 });
	await page.getByRole('button', { name: /^Archived \(1\)/ }).click();

	// Shown again, as the archived thing it now is — and still that after a reload.
	await expect(row).toBeVisible({ timeout: 30_000 });
	await expect(row.getByRole('button', { name: 'Take it back out' })).toBeVisible({
		timeout: 10_000
	});
	await page.waitForTimeout(2000);
	await page.reload();
	await expect(
		page
			.locator('.row-card')
			.filter({ hasText: 'put me away' })
			.getByRole('button', { name: 'Take it back out' })
	).toBeVisible({ timeout: 30_000 });
});
