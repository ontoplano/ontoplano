import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Filters fold away, and never quietly.
 *
 * Seven controls needed three rows on a phone, so the ones you press are
 * behind a disclosure. The risk of folding anything is that a filter somebody
 * cannot see is a filter they forget is on — so what is narrowing the list is
 * named on the button while it is shut, and the way back stands beside it.
 * That is what this checks; the folding itself is the easy half.
 */
test('the filter button says what is narrowing the list, and clears it', async ({ page }) => {
	test.setTimeout(240_000);
	await register(page, testEmail('filter-bar'));
	await visit(page, '/tasks/todo');

	for (const [title, tags] of [
		['ring the plumber', 'home'],
		['post the parcel', 'errands']
	] as const) {
		await page
			.getByRole('button', { name: /New task/ })
			.first()
			.click();
		const form = page.getByRole('dialog');
		await form.locator('[name="heading"]').first().fill(title);
		await form.locator('input[role="combobox"]').first().fill(tags);
		await form.locator('input[role="combobox"]').first().press('Space');
		await page.getByRole('button', { name: 'Create task' }).click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	}

	// Shut to begin with, and the controls are not on the page.
	const fold = page.getByRole('button', { name: 'Filters', exact: true });
	await expect(fold).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('button', { name: /Every notebook/ })).toBeHidden();

	await fold.click();
	await expect(fold).toHaveAttribute('aria-expanded', 'true');

	// Narrow by a label.
	await page.getByRole('button', { name: 'Filter by tag' }).first().click();
	await page.getByRole('option', { name: 'home', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByText('post the parcel')).toBeHidden();

	// Fold it away again — and the button now says what is on. The row's own
	// chip says "#home" too, so this asks the one that folds.
	const named = page.locator('[aria-controls="tasks-filters"]');
	await named.click();
	await expect(named).toHaveAttribute('aria-expanded', 'false');
	await expect(named).toHaveAttribute('aria-pressed', 'true');

	// One press back to everything.
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page.getByText('post the parcel')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
});
