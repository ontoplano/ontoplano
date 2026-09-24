import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { choose } from './helpers/choose';
import { visit } from './helpers/visit';

/**
 * With a notebook chosen, the tag box offers that notebook's words.
 *
 * The whole account's vocabulary is the right list for a task filed nowhere,
 * and the wrong one for a task about the kitchen: the words worth offering
 * there are the ones the kitchen already uses.
 */
async function makeNotebook(page: Page, title: string): Promise<void> {
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await page.getByLabel('Title').fill(title);
	await page.getByRole('button', { name: 'Create notebook' }).click();
	await expect(page.getByRole('link', { name: title }).first()).toBeVisible();
}

async function openTaskForm(page: Page) {
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.locator('#todo-form');
	const more = page.getByRole('button', { name: /Category, notebook/ }).first();
	if (await more.count()) await more.click();
	return form;
}

async function newTask(page: Page, title: string, tags: string, notebook?: string) {
	const form = await openTaskForm(page);
	await form.locator('[name="heading"]').first().fill(title);
	if (notebook) await choose(form, 'notebookId', notebook);
	await form.locator('input[role="combobox"]').fill(`${tags} `);
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Create task/ })
		.last()
		.click();
	await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
}

test('choosing a notebook narrows the tag suggestions to its own', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('notebook-tag-suggestions'));
	await makeNotebook(page, 'Kitchen');

	await visit(page, '/tasks/todo');
	await newTask(page, 'order tiles', 'tiles', 'Kitchen');
	await newTask(page, 'post the letter', 'errand');

	const form = await openTaskForm(page);
	const box = form.locator('input[role="combobox"]');
	const list = form.locator('[role="listbox"]');
	const offered = (name: string) => list.getByRole('option', { name, exact: true });

	// Filed nowhere: every word the account has.
	await box.click();
	await expect(offered('tiles')).toBeVisible();
	await expect(offered('errand')).toBeVisible();

	// The kitchen: only what the kitchen uses.
	await choose(form, 'notebookId', 'Kitchen');
	await box.click();
	await expect(offered('tiles')).toBeVisible();
	await expect(offered('errand')).toHaveCount(0);

	// And back to nowhere, back to everything.
	await choose(form, 'notebookId', /none/);
	await box.click();
	await expect(offered('errand')).toBeVisible();
});
