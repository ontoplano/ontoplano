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

	// A parent counts what is inside it: a kitchen whose cabinet holds a thing
	// has a thing in it, and you would not say that kitchen is empty. The row's
	// title says which part of the number is on this shelf, because the
	// arithmetic on the way down a branch is otherwise somebody's to do.
	const kitchen = page.getByRole('button', { name: /^Kitchen/ }).first();
	await expect(kitchen).toContainText('1');
	await expect(kitchen.locator('[title]')).toHaveAttribute(
		'title',
		/1 thing in Kitchen: 0 here and 1 in what is inside it/
	);

	// And opening it shows what the number counted.
	await kitchen.click();
	await expect(page.getByText('Measuring tape')).toBeVisible();

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

/**
 * Where a thing is, before what kind of thing it is.
 *
 * "4 things in the kitchen" said nothing about which was on the shelf, which
 * was in the cabinet and which was in the drawer — and Everything was a wall
 * of category cards with no idea of place in it at all.
 */
test('the lists are grouped by where things are, then by category', async ({ page }) => {
	await register(page, `inv-places-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');
	await foodCategory(page);
	await visit(page, '/inventory');

	await addLocation(page, 'Kitchen');
	await addLocation(page, 'Kitchen drawer', 'Kitchen');

	for (const [name, where] of [
		['Olive oil', 'Kitchen'],
		['Milk', 'Kitchen › Kitchen drawer'],
		['Dish soap', '']
	]) {
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

	// Everything: one heading per place, each naming the whole address.
	for (const heading of ['Kitchen', 'Kitchen › Kitchen drawer', 'Not filed anywhere']) {
		await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
	}

	// Standing in the kitchen: the shelf and the drawer are told apart.
	await page
		.getByRole('button', { name: /^Kitchen\s/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'Kitchen', exact: true })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Kitchen › Kitchen drawer', exact: true })
	).toBeVisible();
	await expect(page.getByText('Dish soap')).toHaveCount(0);
});

/**
 * A thing's own fields.
 *
 * A tape is 3m or 5m and a cable is USB-C or not; nothing else in the app has
 * either field, so the shape is the thing's rather than a column. They live on
 * the edit form and are saved by the same button as everything else.
 */
test('a thing carries its own fields, and one can be taken off again', async ({ page }) => {
	await register(page, `inv-fields-${Date.now()}@test.invalid`);
	await visit(page, '/inventory');
	await foodCategory(page);
	await visit(page, '/inventory');
	await addItem(page, 'Measuring tape');

	await page.getByRole('button', { name: /^Edit Measuring tape/ }).click();
	let edit = page.getByRole('dialog', { name: 'Edit item' });
	await edit.locator('[name="fieldName"]').first().fill('length');
	await edit.locator('[name="fieldValue"]').first().fill('5m');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();

	// On the row, because a fact you must open a form to see is one nobody reads.
	await expect(page.getByText('length: 5m')).toBeVisible();

	// And off again with the button beside it, rather than by knowing that
	// clearing the name is what removes it.
	await page.getByRole('button', { name: /^Edit Measuring tape/ }).click();
	edit = page.getByRole('dialog', { name: 'Edit item' });
	await edit.getByRole('button', { name: 'Remove the field length' }).click();
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByText('length: 5m')).toHaveCount(0);
});
