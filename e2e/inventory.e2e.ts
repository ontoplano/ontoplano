import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The inventory: the shopping list read on a second axis.
 *
 * They are the same rows. "Milk, we are out" and "the tape, second drawer" are
 * one thing looked at two ways, which is why they are one page — the split
 * into two tabs meant a thing you owned had no price, no tick, no archiving
 * and no category, and that was the wrong half to weaken.
 */
async function foodCategory(page: import('@playwright/test').Page) {
	await page.evaluate(async () => {
		const body = new FormData();
		body.set('label', 'Food');
		body.set('isFood', 'true');
		await fetch('/inventory?/createCategory', { method: 'POST', body });
	});
}

async function addItem(page: import('@playwright/test').Page, name: string) {
	await page
		.getByRole('button', { name: /Add item/ })
		.first()
		.click();
	const d = page.getByRole('dialog', { name: 'New item' });
	await d.locator('[name="label"]').fill(name);
	await d.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(page.getByText(name).first()).toBeVisible();
}

async function addLocation(page: import('@playwright/test').Page, name: string, inside?: string) {
	await page.getByRole('button', { name: 'New location' }).click();
	const d = page.getByRole('dialog', { name: 'New location' });
	await d.locator('[name="heading"]').fill(name);
	if (inside) await d.locator('[name="parentId"]').selectOption({ label: inside });
	await d.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
}

test('a thing is dragged into a drawer, and the page narrows to it', async ({ page }) => {
	await register(page, `inv-drag-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');
	await foodCategory(page);

	await visit(page, '/inventory');
	await addItem(page, 'Milk');
	await addItem(page, 'Measuring tape');

	await addLocation(page, 'Kitchen');
	await addLocation(page, 'Top drawer', 'Kitchen');

	// Dragged from the list onto a location, which is the whole gesture.
	const row = page.locator('div[draggable="true"]').filter({ hasText: 'Measuring tape' }).first();
	const drawer = page.getByRole('button', { name: /^Top drawer/ }).first();
	await row.dragTo(drawer);
	await expect(drawer).toContainText('1');

	// A parent counts what is under it: the drawer's thing is the kitchen's too.
	await expect(page.getByRole('button', { name: /^Kitchen/ }).first()).toContainText('1');

	// Opening a location narrows both lists to what is in it.
	await drawer.click();
	await expect(page.getByText('Measuring tape')).toBeVisible();
	await expect(page.getByText('Milk')).toHaveCount(0);

	// And "Everything" gives them all back.
	await page.getByRole('button', { name: /^Everything/ }).click();
	await expect(page.getByText('Milk')).toBeVisible();
});

test('the whole list still works, filed or not', async ({ page }) => {
	await register(page, `inv-full-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');
	await foodCategory(page);
	await visit(page, '/inventory');
	await addItem(page, 'Butter');

	// A price, a tick, an archive: the things the second tab never had.
	await page.getByRole('button', { name: /^Edit Butter/ }).click();
	const edit = page.getByRole('dialog', { name: 'Edit item' });
	await edit.locator('[name="price"]').fill('3.20');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();

	await page.getByRole('button', { name: /^Got it: Butter/ }).click();
	await expect(page.getByRole('button', { name: /^Put back on the list: Butter/ })).toBeVisible();

	await page.getByRole('button', { name: /^Archive: Butter/ }).click();
	await expect(page.getByText('Butter')).toHaveCount(0);
	await page.getByRole('button', { name: /Show archived/ }).click();
	await expect(page.getByText('Butter')).toBeVisible();
});

test('the find box narrows to one thing', async ({ page }) => {
	await register(page, `inv-find-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');
	await foodCategory(page);
	await visit(page, '/inventory');
	await addItem(page, 'Coffee beans');
	await addItem(page, 'Washing up liquid');

	await page.locator('[name="find"]').fill('coffee');
	await expect(page.getByText('Coffee beans')).toBeVisible();
	await expect(page.getByText('Washing up liquid')).toHaveCount(0);
});

/** Both old addresses, which are in bookmarks and in the installed shell. */
test('every old address lands on the one page', async ({ page }) => {
	await register(page, `inv-urls-${Date.now()}@test.invalid`);
	for (const old of ['/shopping', '/inventory/list', '/inventory/things']) {
		await visit(page, old);
		await expect(page).toHaveURL(/\/inventory$/);
	}
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the panel and the list both fit, and nothing runs off the side', async ({ page }) => {
		await register(page, `inv-phone-${Date.now()}@test.invalid`);
		await visit(page, '/inventory');
		await addLocation(page, 'Kitchen');

		await expect(page.getByRole('button', { name: /^Everything/ })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
