import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A done todo stays linked to its goal.
 *
 * `setGoalLinks` replaces the whole set, which is only safe while the form
 * shows a checkbox for everything linked — and it quietly stopped: the page
 * hid finished todos from the choosing modal, so re-saving it (to add a
 * seventh task, say) unlinked every one already done and the progress bar
 * fell from "1 of 6" to "0 of 6" with no explanation on screen.
 */
test('re-saving the choosing modal keeps the done todo linked', async ({ page }) => {
	await register(page, `goals-${Date.now()}@example.test`);

	// Two todos, through the page's own form. The open-then-fill is retried
	// because the button exists before the page has hydrated enough to obey it.
	await visit(page, '/tasks/todo');
	for (const title of ['first chore', 'second chore']) {
		// `OneLine` is a textarea on purpose (see the component), so the field
		// is found by its label rather than by an input selector.
		const field = page.locator('[name="heading"]');
		await expect(async () => {
			await page
				.getByRole('button', { name: /New to-do/ })
				.first()
				.click();
			await expect(field).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 15000 });
		await field.fill(title);
		await page.getByRole('button', { name: 'Create todo' }).click();
		await page.waitForTimeout(500);
	}

	// A goal, and both todos linked to it.
	await visit(page, '/goals');
	{
		const field = page.locator('[name="heading"]');
		await expect(async () => {
			await page
				.getByRole('button', { name: /New goal/ })
				.first()
				.click();
			await expect(field).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 15000 });
		await field.fill('ship the thing');
	}
	await page.getByRole('button', { name: 'Create goal' }).click();
	await page.waitForTimeout(600);

	await page
		.locator('button', { hasText: /^Tasks \(/ })
		.first()
		.click();
	await page.getByRole('button', { name: 'Choose tasks' }).click();
	const dialog = page.getByRole('dialog');
	for (const title of ['first chore', 'second chore']) {
		await dialog.locator('label', { hasText: title }).locator('input[type="checkbox"]').check();
	}
	await page.getByRole('button', { name: 'Save links' }).click();
	await page.waitForTimeout(600);

	/*
	 * Make sure the card's own fold is open, and wait for it.
	 *
	 * It is often already open behind the modal that just closed, so this used
	 * to sample its visibility once after a fixed delay and click if the answer
	 * was no. Under a loaded parallel run the sample lands before the page has
	 * settled, the click *closes* a fold that was open, and the test waits
	 * thirty seconds for a checkbox that will never come. Asking with a timeout
	 * and re-checking after the click is the same intent without the race.
	 */
	const fold = page.locator('form[action="?/setTodoStatus"]').first();
	const openFold = async () => {
		for (let attempt = 0; attempt < 3; attempt++) {
			// Wait for it rather than sampling: under load the page has often not
			// finished rendering when the question is asked, and a "no" there
			// makes the click below close a fold that was already open.
			if (await fold.isVisible({ timeout: 2000 }).catch(() => false)) return;
			await page
				.locator('button', { hasText: /^Tasks \(/ })
				.first()
				.click();
		}
		await expect(fold).toBeVisible({ timeout: 15_000 });
	};
	await openFold();
	await page
		.locator('form[action="?/setTodoStatus"]', { hasText: 'first chore' })
		.locator('input[type="checkbox"]')
		.click();
	await page.waitForTimeout(600);
	await expect(page.getByText('1 of 2 done')).toBeVisible();

	// Open the modal again and save it untouched — the regression was here.
	await openFold();
	await page.getByRole('button', { name: 'Choose tasks' }).click();
	// The done todo is still offered, ticked, struck through.
	const done = dialog
		.locator('label', { hasText: 'first chore' })
		.locator('input[type="checkbox"]');
	await expect(done).toBeChecked();
	await page.getByRole('button', { name: 'Save links' }).click();
	await page.waitForTimeout(600);

	// Still 1 of 2 — nothing fell off.
	await expect(page.getByText('1 of 2 done')).toBeVisible();

	// And the other direction: a to-do finished BEFORE it was ever linked can
	// still be linked — the completed list unfolds behind its own button.
	await visit(page, '/tasks/todo');
	{
		const field = page.locator('[name="heading"]');
		await expect(async () => {
			await page
				.getByRole('button', { name: /New to-do/ })
				.first()
				.click();
			await expect(field).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 15000 });
		await field.fill('third chore');
		await page.getByRole('button', { name: 'Create todo' }).click();
		await page.waitForTimeout(500);
	}
	// Scoped to its own row: the list's order is not this test's to assume,
	// and the first Mark complete on the page is sometimes another to-do's.
	await page
		.locator('div.flex.items-stretch', { hasText: 'third chore' })
		.getByRole('button', { name: 'Mark complete' })
		.click();
	await page.waitForTimeout(600);

	await visit(page, '/goals');
	await openFold();
	await page.getByRole('button', { name: 'Choose tasks' }).click();
	// Done and never linked: not offered until the completed list unfolds.
	await expect(dialog.locator('label', { hasText: 'third chore' })).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Show completed to-dos' }).click();
	await dialog
		.locator('label', { hasText: 'third chore' })
		.locator('input[type="checkbox"]')
		.check();
	await page.getByRole('button', { name: 'Save links' }).click();
	await page.waitForTimeout(600);
	await expect(page.getByText('2 of 3 done')).toBeVisible();
});
