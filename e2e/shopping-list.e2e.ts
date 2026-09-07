import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The shopping list's categories.
 *
 * Worth its own test because this broke silently once. "New category" was split
 * out of the save-which-ones-hold-food form — two acts should not share one
 * button — and the new form was pointed at an action nobody wrote. The dialog
 * did nothing, said nothing, and every recipe ingredient was refused as a
 * consequence, three screens away.
 */
test('a new category is created, and can hold food', async ({ page }) => {
	await register(page, `categories-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');

	await page.getByRole('button', { name: 'Categories' }).click();
	const dialog = page.locator('dialog[open]');

	await dialog.getByRole('button', { name: /new category/i }).click();
	await dialog.locator('[name=label]').fill('Freezer');
	await dialog.locator('input[name=isFood]').check();
	await dialog.getByRole('button', { name: /add the category/i }).click();

	// It is there, by name, and ticked as food.
	const row = dialog.locator('li', { hasText: 'Freezer' });
	await expect(row).toBeVisible();
	await expect(row.locator('input[name=food]')).toBeChecked();

	// And it survives a reload, which is what says it reached the database
	// rather than only the screen.
	await page.reload({ waitUntil: 'load' });
	await page.waitForSelector('html[data-ready]');
	await page.getByRole('button', { name: 'Categories' }).click();
	await expect(page.locator('dialog[open] li', { hasText: 'Freezer' })).toBeVisible();
});

test('a category that holds food makes ingredients possible', async ({ page }) => {
	await register(page, `food-${Date.now()}@test.invalid`);

	// Before: the recipes page says so rather than letting every field fail.
	await visit(page, '/health/recipes');
	await expect(page.getByText(/no food category yet/i)).toBeVisible();

	await visit(page, '/inventory');
	await page.getByRole('button', { name: 'Categories' }).click();
	const dialog = page.locator('dialog[open]');
	await dialog.getByRole('button', { name: /new category/i }).click();
	await dialog.locator('[name=label]').fill('Pantry');
	await dialog.locator('input[name=isFood]').check();
	await dialog.getByRole('button', { name: /add the category/i }).click();
	await expect(dialog.locator('li', { hasText: 'Pantry' })).toBeVisible();

	// After: the warning is gone.
	await visit(page, '/health/recipes');
	await expect(page.getByText(/no food category yet/i)).toHaveCount(0);
});

/**
 * A price is recorded after the tick, never during it.
 *
 * The tick happens in an aisle, one press, often with no signal; asking for a
 * number there would make the one thing this list is for slower. So the price
 * is the optional second act, and an item's expected price shows on its row
 * so that editing it is visibly an edit.
 *
 * There is no price *comparison* any more. It compared every purchase against
 * the first one ever recorded, which is not a trend, and a mistyped first
 * price poisoned it permanently with nothing in the app able to correct it.
 */
test('a price is set where the rest of the item is, and shows on the row', async ({ page }) => {
	await register(page, `prices-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');

	await page.getByRole('button', { name: /add item/i }).click();
	const dialog = page.locator('dialog[open]');
	await dialog.locator('[name=label]').fill('oat milk');
	await dialog.locator('[name=label]').press('Enter');
	await expect(page.getByText('oat milk')).toBeVisible();

	/*
	 * On the item's own form, not a button of its own on the row.
	 *
	 * It had one for a while — an icon that opened a small box beside the name
	 * — and it was the only thing on the row that appeared when something was
	 * pressed, which is what made a card grow and push everything under it
	 * down. A price is not special enough to be worth that: it is a field,
	 * beside the notes and the kind, where somebody already goes to change
	 * anything else about the thing.
	 */
	await page.getByRole('button', { name: /^Edit oat milk/ }).click();
	const edit = page.getByRole('dialog', { name: 'Edit item' });
	await edit.locator('[name=price]').fill('1.20');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();

	// Nothing claims a trend from one purchase — or from any number of them.
	await expect(page.getByText('→')).toHaveCount(0);

	// And it is on the row, which is what makes editing it look like it worked.
	await page.reload({ waitUntil: 'load' });
	await page.waitForSelector('html[data-ready]');
	await expect(page.getByText(/1[.,]20/).first()).toBeVisible();
});
