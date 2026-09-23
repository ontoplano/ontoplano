import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A note that became a list of tasks points at them, and they open from it.
 *
 * The offer to make todos of a checklist used to leave the boxes where they
 * were, so it stood there over a list already made — and the note and the list
 * were two records of one thing.
 */
test('a checklist becomes references, and a reference opens its task', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('note-todo-links'));
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
	await page
		.locator('textarea[name="content"]')
		.first()
		.fill('Before the work:\n\n- [ ] ring the plumber\n- [ ] book the skip');
	await page
		.getByRole('button', { name: /Save|Add note|Create/ })
		.last()
		.click();
	await expect(page.getByText('Before the work').first()).toBeVisible({ timeout: 30_000 });

	// Make the tasks.
	await page.getByRole('button', { name: 'Make tasks of the checkboxes' }).first().click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /^Make \d+ tasks?$/ })
		.click();
	await page.waitForTimeout(2000);

	// The note now points at them, by their number in this notebook.
	await page.getByText('Before the work').first().click();
	const reference = page.locator('.todo-ref').first();
	await expect(reference).toBeVisible({ timeout: 30_000 });
	await expect(reference).toHaveText(/ring the plumber/);

	// And the offer is gone: there is no checklist left to make.
	await expect(page.getByRole('button', { name: 'Make tasks of the checkboxes' })).toHaveCount(0);

	// Pressing one opens that task's own editor, on the Tasks tab.
	await reference.click();
	await expect(page.locator('dialog[open]')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('dialog[open] [name="heading"]')).toHaveValue('ring the plumber');
});
