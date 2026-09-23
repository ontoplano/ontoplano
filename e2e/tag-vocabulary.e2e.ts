import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The labels are one vocabulary, and the Tags tab is where you manage it.
 *
 * A tag used to come into being by being typed onto something and never leave:
 * no rename, no colour, no way off. What matters on screen is that the change
 * reaches the rooms the label is actually used in — renaming it on this page
 * and seeing the old word still on the task would make the page a lie.
 */
async function newTodo(page: import('@playwright/test').Page, title: string, tags: string) {
	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('#todo-form [name="heading"]').fill(title);
	const more = page.getByRole('button', { name: /Category, notebook/ }).first();
	if (await more.count()) await more.click();
	// The visible box takes the words; `[name="tags"]` is the hidden field the
	// form posts, assembled from the chips. See `TagInput`.
	await page.locator('#todo-form input[role="combobox"]').fill(tags);
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

test('a label renamed on the Tags tab is renamed on the task', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('tag-vocabulary'));
	await visit(page, '/tasks/todo');

	await newTodo(page, 'file the return', 'taxess');
	await expect(page.getByRole('button', { name: '#taxess' })).toBeVisible();

	await visit(page, '/notebooks/tags');
	// The list says the word and how much work it is doing.
	await expect(page.getByText('#taxess')).toBeVisible();
	await expect(page.getByText('1 thing carries it')).toBeVisible();

	await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
	const form = page.locator('#tag-form');
	await form.locator('[name="label"]').fill('taxes');

	// A colour, chosen the way every other colour in the app is chosen.
	await form.locator('input[type="color"]').evaluate((input: HTMLInputElement) => {
		input.value = '#0f766e';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// The label wears its colour: `.pill`, whose ink the browser computes from
	// the fill — a plain label stays the `.chip` it has always been.
	await expect(page.locator('.pill').filter({ hasText: '#taxes' })).toBeVisible();

	// And the task wears the new word.
	await visit(page, '/tasks/todo');
	await expect(page.getByRole('button', { name: '#taxes' })).toBeVisible();
	await expect(page.getByRole('button', { name: '#taxess' })).toHaveCount(0);
});

test('renaming onto a label that already exists merges the two', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('tag-merge'));
	await visit(page, '/tasks/todo');

	await newTodo(page, 'the deck', 'hause');
	await newTodo(page, 'the roof', 'house');

	await visit(page, '/notebooks/tags');
	// Alphabetical, so `hause` is the first row and its Edit is the first one.
	await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
	await page.locator('#tag-form [name="label"]').fill('house');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// One word left, and both tasks under it — rather than the unique index
	// throwing at somebody who was fixing a typo.
	await expect(page.getByText('#hause')).toHaveCount(0);
	await expect(page.getByText('2 things carry it')).toBeVisible();
});

test('a label is deleted behind a confirmation, and comes off what carried it', async ({
	page
}) => {
	test.setTimeout(150_000);
	await register(page, testEmail('tag-delete'));
	await visit(page, '/tasks/todo');

	await newTodo(page, 'paint the fence', 'outside wood');

	await visit(page, '/notebooks/tags');
	await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
	// Two steps, and the second ignores a reflex click for its first moments.
	const confirm = page.getByRole('button', { name: 'Yes, delete' });
	await expect(confirm).toBeVisible();
	await page.waitForTimeout(500);
	await confirm.click();

	await expect(page.getByText('#outside')).toHaveCount(0);

	await visit(page, '/tasks/todo');
	await expect(page.getByRole('button', { name: '#wood' })).toBeVisible();
	await expect(page.getByRole('button', { name: '#outside' })).toHaveCount(0);
});
