import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The New button says what the tab under it is about.
 *
 * Moving it into the notebook's header made it a button that offered the wrong
 * thing: it read "New note" while the Tasks tab was showing, beside a list of
 * tasks. It follows the tab now — and on Goals it goes where goals are written,
 * carrying the notebook with it, because a goal is not written inside a
 * notebook.
 *
 * The list on the Tasks tab is the to-do room's own component, which declares
 * the room's primary verb. Inside a notebook it must not: it was replacing the
 * page's "New notebook" with "New to-do" the moment anybody looked at Tasks.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

test('the header button follows the tab', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('tab-actions'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');

	await expect(page.getByRole('button', { name: 'New note', exact: true })).toBeVisible();

	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await expect(page.getByRole('button', { name: 'New task', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'New note', exact: true })).toHaveCount(0);

	// And it opens the list's own form rather than a second one beside it.
	await page.getByRole('button', { name: 'New task', exact: true }).click();
	await expect(page.locator('#todo-form')).toBeVisible();
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: /^Goals \d/ }).click();
	const toGoals = page.getByRole('link', { name: 'New goal', exact: true });
	await expect(toGoals).toBeVisible();
	await expect(page.getByRole('button', { name: 'New task', exact: true })).toHaveCount(0);
});

test('the notebook keeps its own primary verb while Tasks is showing', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('tab-room-action'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');

	// The room's bar, top right: this page is for making notebooks.
	await expect(page.getByRole('button', { name: /New notebook/ })).toBeVisible();
	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await expect(page.getByRole('button', { name: /New notebook/ })).toBeVisible();
	// …and not a second way to do what the header button beside it already does.
	await expect(page.getByRole('button', { name: /New to-do/ })).toHaveCount(0);
});

test('New goal lands on Goals with the form open and the notebook chosen', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('tab-new-goal'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: /^Goals \d/ }).click();
	await page.getByRole('link', { name: 'New goal', exact: true }).click();
	await page.waitForURL(/\/goals\?/);

	const form = page.locator('#goal-form');
	await expect(form).toBeVisible();
	await expect(form.locator('select[name="notebookId"]')).toHaveValue(/\d+/);
	await expect(form.locator('select[name="notebookId"] option:checked')).toHaveText(/The kitchen/);
});
