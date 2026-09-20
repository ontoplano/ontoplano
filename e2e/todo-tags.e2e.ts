import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Labels on a task, and reading back only the ones you want.
 *
 * The reason tasks wanted tags is one the other rooms did not have: several
 * assistants working the same list need a way to say which of them touched
 * what — `a1`, `done` — rather than a second to-do written to stand for the
 * first. So the two things that matter on screen are that a label can be put
 * on, and that the list can be narrowed to one.
 */
async function newTodo(page: import('@playwright/test').Page, title: string, tags: string) {
	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('#todo-form [name="heading"]').fill(title);
	const more = page.getByRole('button', { name: /Category, notebook/ }).first();
	if (await more.count()) await more.click();
	// The visible box takes the words; `[name="tags"]` is the hidden field the
	// form posts, assembled from the chips. See `TagInput`.
	await page.locator('#todo-form input[role="combobox"]').fill(tags);
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

test('a task takes labels, and the list narrows to one', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('todo-tags'));
	await visit(page, '/tasks/todo');

	await newTodo(page, 'renew the domain', '#A1, Done');
	// Normalised the way every other tag is: lower case, no hash, in order.
	await expect(page.getByRole('button', { name: '#a1' })).toBeVisible();
	await expect(page.getByRole('button', { name: '#done' })).toBeVisible();

	await newTodo(page, 'call the vet', 'a2');
	await expect(page.getByText('renew the domain')).toBeVisible();

	// Pressing a label is the filter: reading back one of them has to be a
	// press, or nobody uses them.
	await page.getByRole('button', { name: '#a2' }).click();
	await expect(page.getByText('call the vet')).toBeVisible();
	await expect(page.getByText('renew the domain')).toHaveCount(0);

	// And pressing it again lets go.
	await page.getByRole('button', { name: '#a2' }).click();
	await expect(page.getByText('renew the domain')).toBeVisible();

	// The picker offers what is actually on the list, and nothing else. It is
	// the app's own menu rather than a `<select>` — see `Picker`.
	await page.getByRole('button', { name: 'Filter by tag' }).click();
	await expect(page.getByRole('option')).toHaveText(['Every tag', 'Untagged', 'a1', 'a2', 'done']);
	await page.getByRole('option', { name: 'a1', exact: true }).click();
	await expect(page.getByText('renew the domain')).toBeVisible();
	await expect(page.getByText('call the vet')).toHaveCount(0);
});

test('labels are edited, and an edit that says nothing about them keeps them', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('todo-tags-edit'));
	await visit(page, '/tasks/todo');

	await newTodo(page, 'sand the door', 'a1 wood');

	// The edit form arrives with them as chips, and the value it will post is
	// assembled from those.
	await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
	const form = page.locator('#todo-form');
	await expect(form.locator('.chip').filter({ hasText: 'a1' })).toBeVisible();
	await expect(form.locator('.chip').filter({ hasText: 'wood' })).toBeVisible();
	await expect(form.locator('[name="tags"]')).toHaveValue('a1, wood');

	/*
	 * Take both off with the keyboard.
	 *
	 * Backspace on an empty box removes the last chip, which is what a box of
	 * chips does everywhere. Driven this way rather than by pressing the two
	 * remove buttons: removing one re-lays out the row under the pointer, and
	 * what that does to a synthetic click is a question about the harness
	 * rather than about the app.
	 */
	const box = form.locator('input[role="combobox"]');
	await box.click();
	await box.press('Backspace');
	await expect(form.locator('.chip')).toHaveCount(1);
	await box.press('Backspace');
	await expect(form.locator('.chip')).toHaveCount(0);

	await box.fill('a2');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: '#a2' })).toBeVisible();
	await expect(page.getByRole('button', { name: '#a1' })).toHaveCount(0);

	// Taken off altogether, and then the picker goes with them.
	await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
	await page.locator('#todo-form .chip').filter({ hasText: 'a2' }).getByRole('button').click();
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: '#a2' })).toHaveCount(0);
	await expect(page.getByLabel('Filter by tag')).toHaveCount(0);
});
