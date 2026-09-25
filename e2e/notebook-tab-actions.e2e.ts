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
		// Goals among them: a notebook starts with notes and tasks now, and what
		// these are about is the tabs rather than which of them there are.
		form: { heading: title, modules: 'notes,tasks,goals' }
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
	const bar = page.locator('.room-bar');
	await expect(bar.getByRole('button', { name: /New notebook/ })).toBeVisible();
	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await expect(bar.getByRole('button', { name: /New notebook/ })).toBeVisible();
	/*
	 * …and not a second way to do what the header button beside it already
	 * does. Scoped to the bar: the notebook's own header legitimately offers
	 * "New task" while that tab is showing, and the two used to be told apart
	 * by their words rather than by where they are — which stopped working
	 * the day the to-do list started calling its rows tasks.
	 */
	await expect(bar.getByRole('button', { name: /New task/ })).toHaveCount(0);
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

test('several things come in at once, and what moves is named first', async ({ page }) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('link-many'));

	await visit(page, '/notebooks');
	for (const title of ['Kitchen', 'Trip']) {
		await page
			.getByRole('button', { name: /New notebook/ })
			.first()
			.click();
		const dialog = page.getByRole('dialog');
		await dialog.locator('[name="heading"]').fill(title);
		await dialog
			.getByRole('button', { name: /Create|Add/ })
			.last()
			.click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	}

	// Two notes under the trip, and one under nothing.
	await page.getByRole('link', { name: /Trip/ }).first().click();
	for (const content of ['nine days in September', 'the train is three hours']) {
		await page.getByRole('button', { name: 'New note', exact: true }).first().click();
		await page.locator('textarea[name="content"]').first().fill(content);
		await page
			.getByRole('button', { name: /Add note/ })
			.last()
			.click();
		await expect(page.getByText(content).first()).toBeVisible({ timeout: 30_000 });
	}

	await page
		.getByRole('link', { name: /Kitchen/ })
		.first()
		.click();
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.locator('textarea[name="content"]').first().fill('the plumber can move the pipes');
	await page
		.getByRole('button', { name: /Add note/ })
		.last()
		.click();
	await expect(page.getByText('the plumber can move the pipes').first()).toBeVisible({
		timeout: 30_000
	});

	await page
		.getByRole('button', { name: /Link note/ })
		.first()
		.click();
	const picker = page.getByRole('dialog');
	const elsewhere = picker.locator('label').filter({ hasText: 'IN ANOTHER NOTEBOOK' });

	// A note has no heading, so the picker has to list it by its first line —
	// it used to read `title` and draw a column of blank rows.
	const septemberNote = elsewhere.filter({ hasText: 'nine days in September' });
	const trainNote = elsewhere.filter({ hasText: 'the train is three hours' });
	await expect(septemberNote).toHaveCount(1);
	await expect(trainNote).toHaveCount(1);

	await septemberNote.locator('input[type=checkbox]').check();
	await trainNote.locator('input[type=checkbox]').check();
	await page.getByRole('button', { name: 'Bring 2 things' }).click();

	// Both are under the trip, so both are named before anything moves.
	const warning = page.getByText(/These live in another notebook/);
	await expect(warning).toBeVisible();
	await page.getByRole('button', { name: 'Proceed' }).click();

	/*
	 * Arriving is the point, and it used to need a reload. Under that, the
	 * numbering: a note carried its number across and collided with the one
	 * already here, which answered "Unexpected error".
	 */
	await expect(page.getByText('nine days in September').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText('the train is three hours').first()).toBeVisible();
	await expect(page.getByText(/Brought 2 things to Kitchen/)).toBeVisible();
});
