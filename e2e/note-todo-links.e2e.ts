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

/**
 * A note points at another note the same way, and that opens too.
 *
 * `NOTE:#1` used to be a link to `#diary-1` — an address only the diary
 * answers — so inside a notebook it was a link to nowhere.
 */
test('a note named by its number opens from another note', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('note-note-links'));
	await visit(page, '/notebooks');

	await page
		.getByRole('button', { name: /New notebook/ })
		.first()
		.click();
	const create = page.getByRole('dialog');
	await create.locator('[name="heading"]').fill('Garden');
	await create
		.getByRole('button', { name: /Create|Add/ })
		.last()
		.click();
	await expect(page.getByText('Garden').first()).toBeVisible({ timeout: 30_000 });

	// Waited for in the list, by its title: the composer is a form in the
	// panel, and its live preview already draws the reference.
	for (const [title, body] of [
		['The hedge', 'sixty metres of laurel'],
		['Plan', 'start from NOTE:#1']
	]) {
		await page.getByRole('button', { name: 'New note', exact: true }).first().click();
		await page.locator('textarea[name="content"]').first().fill(`${title}\n\n${body}`);
		await page
			.getByRole('button', { name: /Save|Add note|Create/ })
			.last()
			.click();
		await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible({
			timeout: 30_000
		});
	}

	await page.getByRole('button', { name: 'Plan', exact: true }).click();
	const reference = page.locator('a[data-ref="note"]').first();
	await expect(reference).toHaveText('The hedge');
	await expect(page.getByText('sixty metres of laurel')).toHaveCount(0);

	await reference.click();
	await expect(page.getByText('sixty metres of laurel')).toBeVisible();
});

/**
 * A goal is numbered in its notebook the way a task is, and `GOAL:#1` in a
 * note names it and opens it.
 */
test('a goal named by its number opens from a note', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('note-goal-links'));
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: 'Running', modules: 'notes,tasks,goals' }
	});
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: /^Goals \d/ }).click();
	await page.getByRole('button', { name: 'New goal', exact: true }).click();
	const form = page.locator('#notebook-goal-form');
	await expect(form).toBeVisible({ timeout: 30_000 });
	await form.locator('[name="heading"]').first().fill('Run a 10k');
	await page.getByRole('button', { name: 'Create goal' }).click();
	// Its number, on its card, is what a note points at.
	await expect(page.getByText('#1Run a 10k').first()).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: /^Notes/ }).click();
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.locator('textarea[name="content"]').first().fill('Training\n\ntowards GOAL:#1');
	await page
		.getByRole('button', { name: /Save|Add note|Create/ })
		.last()
		.click();
	// The note in the list, not the composer's preview of it.
	const training = page.getByRole('button', { name: 'Training', exact: true });
	await expect(training).toBeVisible({ timeout: 30_000 });

	await training.click();
	const reference = page.locator('a[data-ref="goal"]').first();
	await expect(reference).toHaveText('Run a 10k');

	await reference.click();
	await expect(page.locator('#notebook-goal-form')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('#notebook-goal-form [name="heading"]').first()).toHaveValue(
		'Run a 10k'
	);
});
