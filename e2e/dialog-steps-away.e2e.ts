import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A dialog saved from its footer leaves before the server answers.
 *
 * Every create and edit form used to stand open for the whole round trip,
 * which made the app feel a second or two slow at the moment it was used
 * most. `$lib/enhance` now has the dialog step away on the press; `Modal`
 * keeps what was typed, and brings it back only if the save is refused.
 */

/** Hold every form post for a while, and optionally refuse it. */
async function slowPosts(page: Page, refuse: string | null) {
	await page.route(/\?\//, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await new Promise((done) => setTimeout(done, 1500));
		if (refuse === null) return route.continue();
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				type: 'failure',
				status: 400,
				data: JSON.stringify([{ message: 1 }, refuse])
			})
		});
	});
}

async function startTask(page: Page, title: string) {
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.locator('#todo-form [name="heading"]').fill(title);
}

test('the dialog is gone on the press, and the task arrives behind it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-away'));
	await visit(page, '/tasks/todo');
	await slowPosts(page, null);

	await startTask(page, 'sent without waiting');
	await page.getByRole('button', { name: 'Create task' }).click();
	// Well inside the held 1.5s: the answer cannot have come yet.
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 500 });

	await expect(page.getByText('sent without waiting').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('a refused save brings the dialog back, with what was typed and why', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-back'));
	await visit(page, '/tasks/todo');
	await slowPosts(page, 'The server said no');

	await startTask(page, 'this one is refused');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 500 });

	const dialog = page.locator('dialog[open]');
	await expect(dialog).toContainText('The server said no', { timeout: 10_000 });
	await expect(dialog.locator('[name="heading"]')).toHaveValue('this one is refused');
});
