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
	// A button, not a link: a goal is written here now, the way a task is.
	await expect(page.getByRole('button', { name: 'New goal', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'New goal', exact: true })).toHaveCount(0);
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

/**
 * A goal is written where you are.
 *
 * This used to be a link to the goals room carrying the notebook, so the same
 * press stayed put on the Tasks tab and threw you out of the notebook on the
 * Goals one. The form is the goals room's own fields either way.
 */
test('New goal opens a form in the notebook, and the goal lands in it', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('tab-new-goal'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: /^Goals \d/ }).click();
	await page.getByRole('button', { name: 'New goal', exact: true }).click();

	// Still on the notebook, with the goals room's own fields in front of you.
	await expect(page).toHaveURL(/\/notebooks/);
	const form = page.locator('#notebook-goal-form');
	await expect(form).toBeVisible({ timeout: 30_000 });

	await form.locator('[name="heading"]').first().fill('Cook something new each week');
	await page.getByRole('button', { name: 'Create goal' }).click();

	// It is filed under the notebook you were looking at, and you are still here.
	await expect(page).toHaveURL(/\/notebooks/);
	await expect(page.getByText('Cook something new each week').first()).toBeVisible({
		timeout: 30_000
	});
});
