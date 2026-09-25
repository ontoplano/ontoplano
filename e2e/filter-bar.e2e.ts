import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The filters are out where there is room, and never narrow anything quietly.
 *
 * On a desktop they are simply on the strip: filtering is narrow, look,
 * adjust, and a press between somebody and a control they can see room for is
 * a press in the middle of that loop. On a phone four controls do not fit
 * across 390px, so they are a sheet — and the risk of any press is that a
 * filter somebody cannot see is a filter they forget is on. That is what this
 * checks at both widths; the layout is the easy half.
 */
test('the filters are out on a wide screen, and clear in one press', async ({ page }) => {
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

	// No press to reach them, and no button offering one.
	await expect(page.locator('#tasks-filters')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Filter by tag' }).first()).toBeVisible();
	await expect(page.locator('.filter-toggle')).toHaveCount(0);

	// Narrow by a label.
	await page.getByRole('button', { name: 'Filter by tag' }).first().click();
	await page.locator('#todo-tags-panel [data-side="include"] input').click();
	await page.getByRole('option', { name: 'home', exact: true }).click();
	// Wait for the filter to land before closing. Otherwise its navigation
	// can finish after the history pop and accidentally hide a lost filter.
	await expect(page).toHaveURL(/tag=home/);
	await page.keyboard.press('Escape');
	await expect(page.getByText('post the parcel')).toBeHidden();

	// One press back to everything.
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page.getByText('post the parcel')).toBeVisible();
});

test('on a phone they are a sheet, and the button says one is on', async ({ page }) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('filter-sheet'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('ring the plumber');
	await form.locator('input[role="combobox"]').first().fill('home');
	await form.locator('input[role="combobox"]').first().press('Space');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	// The controls are not on the strip: that is the whole point of the width.
	const sheet = page.locator('.filter-toggle');
	await expect(sheet).toHaveCount(1);
	await expect(sheet).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByRole('button', { name: 'Filter by tag' })).toBeHidden();

	await sheet.click();
	await expect(page.getByRole('button', { name: 'Filter by tag' }).first()).toBeVisible();

	// Narrow, and close it: the button carries that something is on, so a
	// filter behind a press is never a list that has quietly lost rows.
	await page.getByRole('button', { name: 'Filter by tag' }).first().click();
	await page.locator('#todo-tags-panel [data-side="include"] input').click();
	await page.getByRole('option', { name: 'home', exact: true }).click();
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Done' }).click();

	await expect(sheet).toHaveAttribute('aria-pressed', 'true');
});
