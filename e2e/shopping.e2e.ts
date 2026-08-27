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

test('what you actually paid, and how it has moved', async ({ page }) => {
	await register(page, `prices-${Date.now()}@test.invalid`);
	await page.goto('/shopping', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: /add item/i }).click();
	const dialog = page.locator('dialog[open]');
	await dialog.locator('input[name=name]').fill('oat milk');
	await dialog.locator('input[name=name]').press('Enter');
	await expect(page.getByText('oat milk')).toBeVisible();

	// Ticking never asks for a price: it happens in an aisle, one press.
	await page
		.getByRole('button', { name: /got it/i })
		.first()
		.click();
	await expect(page.getByText('paid?').first()).toBeVisible();

	// The price is the optional second act.
	await page.getByText('paid?').first().click();
	await page.locator('input[name=paid]').fill('1.20');
	await page.getByRole('button', { name: /save what you paid/i }).click();
	await page.waitForTimeout(400);

	// One price says nothing yet — it is already on the row.
	await expect(page.getByText('→')).toHaveCount(0);

	// Put it back on the list and buy it again, dearer.
	await page.getByRole('button', { name: /show bought/i }).click();
	await page.waitForTimeout(300);
	await page
		.getByRole('button', { name: /need to buy/i })
		.first()
		.click();
	await page.waitForTimeout(400);
	await page
		.getByRole('button', { name: /got it/i })
		.first()
		.click();
	await page.waitForTimeout(400);

	await page.getByText('paid?').first().click();
	await page.locator('input[name=paid]').fill('1.60');
	await page.getByRole('button', { name: /save what you paid/i }).click();

	await expect(page.getByText(/→/)).toBeVisible();
	await expect(page.getByText(/\+33%/)).toBeVisible();
});
