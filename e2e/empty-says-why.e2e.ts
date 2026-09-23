import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * An empty list says which kind of empty it is.
 *
 * Searching for something nothing matches used to answer "Nothing waiting — a
 * task is one with no day on it", which is a list telling you it is empty
 * while it is holding six rows back. The two toggles were the only filters
 * when that copy was written; there are four more now.
 */
test('a search that matches nothing says so, not that there is nothing', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('empty-why'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.getByRole('dialog').locator('[name="heading"]').first().fill('ring the plumber');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	await page.locator('input[type="search"]').first().fill('something nothing matches');
	await page.waitForTimeout(500);

	await expect(page.getByText('Nothing to show')).toBeVisible();
	await expect(page.getByText(/match what you are filtering by/)).toBeVisible();
	await expect(page.getByText(/A task is|no day on it/)).toBeHidden();
});
