import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Pressing Create twice makes one task.
 *
 * The first press takes long enough to look like it missed, so pressing again
 * is what anybody does — and it used to make a second task.
 */
test('a double press on Create makes one task', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('double-submit'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New to-do/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('ring the plumber');

	const create = form.getByRole('button', { name: /Create todo/ });
	// Two presses as fast as the browser will deliver them.
	await create.click({ noWaitAfter: true });
	await create.click({ noWaitAfter: true, force: true }).catch(() => {});

	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(2000);
	await expect(page.getByText('ring the plumber')).toHaveCount(1);
});
