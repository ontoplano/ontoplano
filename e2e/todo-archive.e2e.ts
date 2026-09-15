import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Put away, which is neither done nor deleted.
 *
 * A task somebody is not going to look at for a while and is not willing to
 * throw out. It leaves the list without being finished, comes back exactly as
 * it was, and the filters beside it decide what the list is showing — including
 * the tasks nobody has filed under a notebook, which is a thing people go
 * looking for rather than the absence of a filter.
 */
async function addTodo(page: import('@playwright/test').Page, title: string) {
	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill(title);
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

test('a todo can be put away and taken back out', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('arch'));
	await visit(page, '/tasks/todo');
	await addTodo(page, 'the tax thing');

	// One todo on the page, so one such button.
	await page.getByRole('button', { name: 'Put it away' }).click();

	// Gone from the list, and not by being finished.
	await expect(page.getByText('the tax thing')).toHaveCount(0);

	await page.getByRole('button', { name: 'Show archived' }).click();
	await expect(page.getByText('the tax thing').first()).toBeVisible();

	// And back, unchanged.
	await page.getByRole('button', { name: 'Take it back out' }).first().click();
	await page.getByRole('button', { name: 'Hide archived' }).click();
	await expect(page.getByText('the tax thing').first()).toBeVisible();
});

test('the notebook filter has an answer for the unfiled', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('arch-book'));

	const origin = new URL(page.url()).origin;
	const action = { Origin: origin, 'x-sveltekit-action': 'true' };
	await page.request.post('/notebooks?/create', { headers: action, form: { heading: 'Kitchen' } });
	await visit(page, '/tasks/todo');
	await addTodo(page, 'a task nobody filed');

	const filter = page.getByRole('combobox').first();
	await expect(filter.getByRole('option', { name: 'Not in one' })).toBeAttached();
	await expect(filter.getByRole('option', { name: 'Kitchen' })).toBeAttached();

	// Filed under nothing, so "Not in one" keeps it and the notebook drops it.
	await filter.selectOption('none');
	await expect(page.getByText('a task nobody filed').first()).toBeVisible();

	await filter.selectOption({ label: 'Kitchen' });
	await expect(page.getByText('a task nobody filed')).toHaveCount(0);
});
