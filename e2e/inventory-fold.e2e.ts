import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * One fold, on both halves of the panel.
 *
 * The tree on the left folds a place away; the list beside it had no way to do
 * the same, so a house with six drawers was six headings and a metre of cards
 * whatever you did. Pressing a place heading now puts it away with everything
 * under it — the same state the tree's chevron sets, so the two halves cannot
 * disagree about what is open.
 */
async function addLocation(page: import('@playwright/test').Page, name: string, inside?: string) {
	await page.getByRole('button', { name: 'New location' }).click();
	const d = page.getByRole('dialog', { name: 'New location' });
	await d.locator('[name="heading"]').fill(name);
	if (inside) await d.locator('[name="parentId"]').selectOption({ label: inside });
	await d.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
}

async function addItem(page: import('@playwright/test').Page, name: string, where?: string) {
	await page
		.getByRole('button', { name: /Add item/ })
		.first()
		.click();
	const d = page.getByRole('dialog', { name: 'New item' });
	await d.locator('[name="label"]').fill(name);
	if (where) await d.locator('[name="locationId"]').selectOption({ label: where });
	await d.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(d).toBeHidden();
}

test('a place folds away on the list, and takes what is under it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `fold-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');

	// A kitchen with a drawer inside it, something in each, and something
	// filed nowhere — so there is more than one heading and the fold is
	// answering a real question.
	await addLocation(page, 'Kitchen');
	await addLocation(page, 'Kitchen drawer', 'Kitchen');
	await addItem(page, 'Rice', 'Kitchen');
	await addItem(page, 'Vinegar', 'Kitchen › Kitchen drawer');
	await addItem(page, 'Soap');

	await expect(page.getByText('Rice').first()).toBeVisible();
	await expect(page.getByText('Vinegar').first()).toBeVisible();

	// Folding the kitchen takes the drawer inside it with it.
	await page.getByRole('button', { name: 'Fold Kitchen', exact: true }).first().click();
	await expect(page.getByText('Rice')).toHaveCount(0);
	await expect(page.getByText('Vinegar')).toHaveCount(0);
	// Somewhere else is untouched.
	await expect(page.getByText('Soap').first()).toBeVisible();

	await page.getByRole('button', { name: 'Show what is in Kitchen', exact: true }).first().click();
	await expect(page.getByText('Rice').first()).toBeVisible();
	await expect(page.getByText('Vinegar').first()).toBeVisible();
});
