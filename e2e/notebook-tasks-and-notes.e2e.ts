import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook's Tasks tab is the to-do room looking at one subject.
 *
 * It used to be a read-only list: you could see that four things about the
 * kitchen were waiting and could not tick one off without going somewhere
 * else. And a note, like a task, can now be put away — hidden rather than
 * deleted, since a notebook kept for a year holds writing that has stopped
 * being current and is still not something to throw out.
 */
async function makeNotebook(page: import('@playwright/test').Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

test('a notebook’s tasks are operated on where they are', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, `nb-tasks-${Date.now()}@test.invalid`);
	await makeNotebook(page, 'Kitchen');
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: 'Tasks' }).click();

	// Written here, so it lands in this notebook without being asked.
	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('#todo-form [name="heading"]').fill('measure the wall');
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('measure the wall').first()).toBeVisible();

	// The whole verb set, on the row: away and back.
	await page.getByRole('button', { name: 'Put it away' }).first().click();
	await expect(page.getByText('measure the wall')).toHaveCount(0);
	await page.getByRole('button', { name: 'Show archived' }).click();
	await expect(page.getByText('measure the wall').first()).toBeVisible();
	await page.getByRole('button', { name: 'Take it back out' }).first().click();

	// And ticked off, which the tab count says out loud.
	await page.getByRole('button', { name: 'Mark complete' }).first().click();
	await expect(page.getByRole('button', { name: 'Tasks 1/1' })).toBeVisible();
});

test('a note can be put away and taken back out', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, `nb-notes-${Date.now()}@test.invalid`);
	await makeNotebook(page, 'Lisbon');
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: 'New note', exact: true }).click();
	await page.locator('form[action="?/addEntry"] [name="heading"]').fill('Restaurants');
	await page.locator('form[action="?/addEntry"] textarea[name="content"]').fill('where to eat');
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByText('Restaurants').first()).toBeVisible();

	await page.getByRole('button', { name: 'Put it away' }).first().click();
	await expect(page.getByText('Restaurants')).toHaveCount(0);

	// Hidden, not gone: the strip says how many, and they come back unchanged.
	await page.getByRole('button', { name: 'Show archived' }).click();
	await expect(page.getByText('Restaurants').first()).toBeVisible();
	await page.getByRole('button', { name: 'Take it back out' }).first().click();
	await expect(page.getByText('Restaurants').first()).toBeVisible();
});
