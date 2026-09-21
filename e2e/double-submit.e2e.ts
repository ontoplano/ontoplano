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

/**
 * And a form with something new to say each time is not stopped.
 *
 * The guard is "identical, not merely second": a drag posts a different width
 * every few pixels, and swallowing the second post left the panel remembering
 * where the drag passed through rather than where it ended. That case is
 * `e2e/notebook-keys.e2e.ts`, which drags the divider and reloads.
 */

/**
 * And the same in a notebook, which is a different form on a different page.
 *
 * The guard lives in `$lib/enhance` rather than in a form, so this is the
 * question worth asking of a second one: it is not that this form remembered,
 * it is that no form has to.
 */
test('a double press on a notebook’s New note makes one note', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('double-submit-note'));
	await visit(page, '/notebooks');

	await page
		.getByRole('button', { name: /New notebook/ })
		.first()
		.click();
	const create = page.getByRole('dialog');
	await create.locator('[name="heading"]').fill('Kitchen');
	await create
		.getByRole('button', { name: /Create|Add/ })
		.last()
		.click();
	await expect(page.getByText('Kitchen').first()).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.locator('textarea[name="content"]').first().fill('Tiles arrive Tuesday.');
	const add = page.getByRole('button', { name: /Add note/ });
	await add.click({ noWaitAfter: true });
	await add.click({ noWaitAfter: true, force: true }).catch(() => {});

	await expect(page.getByText('Tiles arrive Tuesday.').first()).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(2000);
	await expect(page.getByText('Tiles arrive Tuesday.')).toHaveCount(1);
});
