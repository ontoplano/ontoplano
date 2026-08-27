import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

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
	await page.goto('/shopping', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Categories' }).click();
	const dialog = page.locator('dialog[open]');

	await dialog.getByRole('button', { name: /new category/i }).click();
	await dialog.locator('input[name=name]').fill('Freezer');
	await dialog.locator('input[name=isFood]').check();
	await dialog.getByRole('button', { name: /add the category/i }).click();

	// It is there, by name, and ticked as food.
	const row = dialog.locator('li', { hasText: 'Freezer' });
	await expect(row).toBeVisible();
	await expect(row.locator('input[name=food]')).toBeChecked();

	// And it survives a reload, which is what says it reached the database
	// rather than only the screen.
	await page.reload({ waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Categories' }).click();
	await expect(page.locator('dialog[open] li', { hasText: 'Freezer' })).toBeVisible();
});

test('a category that holds food makes ingredients possible', async ({ page }) => {
	await register(page, `food-${Date.now()}@test.invalid`);

	// Before: the recipes page says so rather than letting every field fail.
	await page.goto('/kitchen/recipes', { waitUntil: 'networkidle' });
	await expect(page.getByText(/no shopping category holds food/i)).toBeVisible();

	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Categories' }).click();
	const dialog = page.locator('dialog[open]');
	await dialog.getByRole('button', { name: /new category/i }).click();
	await dialog.locator('input[name=name]').fill('Pantry');
	await dialog.locator('input[name=isFood]').check();
	await dialog.getByRole('button', { name: /add the category/i }).click();
	await expect(dialog.locator('li', { hasText: 'Pantry' })).toBeVisible();

	// After: the warning is gone.
	await page.goto('/kitchen/recipes', { waitUntil: 'networkidle' });
	await expect(page.getByText(/no shopping category holds food/i)).toHaveCount(0);
});
