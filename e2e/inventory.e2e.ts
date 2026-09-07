import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The other half of the shopping list: where the things you own actually are.
 *
 * "Where do we keep the measuring tape?" — the whole feature answers that, and
 * it crosses a tree, an item, and the item's own fields. Driven the way a
 * person does it: build a corner of a house, put something in it, say what it
 * is, then take the shelf away and watch nothing get destroyed.
 */
test('a house is built, a thing is filed, and removing a shelf destroys nothing', async ({
	page
}) => {
	await register(page, `inventory-${Date.now()}@test.invalid`);
	await visit(page, '/inventory/things');

	const newLocation = async (name: string, inside?: string) => {
		await page.getByRole('button', { name: /New location/ }).click();
		const d = page.getByRole('dialog');
		await d.locator('[name="heading"]').fill(name);
		if (inside) await d.locator('[name="parentId"]').selectOption({ label: inside });
		await d.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(d).toBeHidden();
	};

	await newLocation('Living room');
	await newLocation('White chest', 'Living room');
	await expect(page.getByText('White chest')).toBeVisible();

	// Something you already own — it goes into the inventory, never onto the list.
	await page
		.getByRole('button', { name: /Add a thing/ })
		.first()
		.click();
	let d = page.getByRole('dialog');
	await d.locator('[name="heading"]').fill('Measuring tape');
	await d.locator('[name="locationId"]').selectOption({ label: 'Living room › White chest' });
	await d.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(d).toBeHidden();

	// The address reads root-down, the way somebody would say it.
	await expect(page.getByText('Living room › White chest')).toBeVisible();

	// Its own fields: not every thing shares a shape.
	await page.getByRole('button', { name: /Fields for Measuring tape/ }).click();
	d = page.getByRole('dialog');
	await d.locator('input[name="fieldName"]').first().fill('length');
	await d.locator('input[name="fieldValue"]').first().fill('5m');
	await d.getByRole('button', { name: 'Save' }).click();
	await expect(d).toBeHidden();
	await expect(page.getByText('length: 5m')).toBeVisible();

	/*
	 * And it is not on the shopping list. A thing you have is not a thing to
	 * get — this is the line the two halves are divided on.
	 */
	await visit(page, '/inventory/list');
	await expect(page.locator('[data-tour="shopping-list"]').getByText('Measuring tape')).toHaveCount(
		0
	);

	// Removing the shelf: the thing survives, it just loses its address.
	await visit(page, '/inventory/things');
	await page.getByRole('button', { name: 'Remove White chest' }).click();
	// By its accessible name: every Modal in the page is a <dialog>, so "the
	// dialog" on its own matches all of them, open or not.
	const confirm = page.getByRole('dialog', { name: 'Remove this location?' });
	// What it says, not whether it has finished animating in.
	await expect(confirm).toContainText('keep existing');
	await confirm.getByRole('button', { name: /Yes, remove it/ }).click();
	await expect(confirm).toBeHidden();

	await expect(page.getByText('White chest')).toHaveCount(0);
	await expect(page.getByText('Measuring tape')).toBeVisible();
	await expect(page.getByText('no address yet')).toBeVisible();
});

/** The shopping list is where it always was, under a new address. */
test('the old shopping address lands on the list, which still works', async ({ page }) => {
	await register(page, `inv-list-${Date.now()}@test.invalid`);

	await visit(page, '/shopping');
	await expect(page).toHaveURL(/\/inventory\/list/);

	await page
		.getByRole('button', { name: /Add item/ })
		.first()
		.click();
	const d = page.getByRole('dialog');
	await d.locator('[name="label"]').fill('Milk');
	await d.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(d).toBeHidden();
	await expect(page.getByText('Milk')).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the tree and what is in it both fit', async ({ page }) => {
		await register(page, `inv-phone-${Date.now()}@test.invalid`);
		await visit(page, '/inventory/things');

		await page.getByRole('button', { name: /New location/ }).click();
		const d = page.getByRole('dialog');
		await d.locator('[name="heading"]').fill('Kitchen drawer');
		await d.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(d).toBeHidden();

		await expect(page.getByText('Kitchen drawer')).toBeVisible();
		await expect(page.getByRole('button', { name: /Add a thing/ }).first()).toBeVisible();

		// Nothing overflows the screen sideways, which is the one thing a phone
		// layout can get wrong without anybody noticing on a laptop.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
