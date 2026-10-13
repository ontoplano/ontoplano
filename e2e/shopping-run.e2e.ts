import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The list you take to the shop, from the cupboard you keep.
 *
 * The room is about what you have and where it lives; this is the one reading
 * of it that is about the trip — what has run low, how much of it, what that
 * is likely to cost, and the someday list under the total rather than in it.
 */
test('the shopping list adds up what has run low, and keeps the wishlist out of the total', async ({
	page
}) => {
	await register(page, testEmail('shop-run'));
	await visit(page, '/inventory');

	// Something you keep four of and have none of, at a known price.
	await page.getByRole('button', { name: /Add item/ }).click();
	const form = page.getByRole('dialog');
	await form.locator('[name="label"]').fill('Tinned tomatoes');
	await form.locator('[name="idealQty"]').fill('4');
	await form.locator('[name="price"]').fill('2.50');
	await form.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(page.getByText('Tinned tomatoes')).toBeVisible();

	// And something for the someday list, which is not part of the trip.
	await page.getByRole('button', { name: /Add item/ }).click();
	const wish = page.getByRole('dialog');
	await wish.locator('[name="label"]').fill('A better pan');
	await wish.locator('[name="type"]').selectOption('someday');
	await wish.locator('[name="price"]').fill('80.00');
	await wish.getByRole('button', { name: 'Add item', exact: true }).click();
	// Written on the cupboard's tab and filed on the wishlist, which is where
	// it now shows: the list a thing is on is a tab rather than a filter.
	await page.getByRole('link', { name: 'Wishlist', exact: true }).click();
	await expect(page.getByText('A better pan')).toBeVisible();

	await page.getByRole('button', { name: /Shopping list/ }).click();
	const list = page.getByRole('dialog').filter({ hasText: 'Shopping list' });

	// Four of them, at two fifty each: ten — on the line and again as the
	// total, which is why this reads the sheet rather than hunting a string
	// that legitimately appears twice.
	const sheet = (await list.innerText()).replace(/\s+/g, ' ');
	expect(sheet).toMatch(/4× Tinned tomatoes .*10[.,]00/);
	expect(sheet).toMatch(/About .*10[.,]00/);

	// And the someday list under the total rather than inside it.
	expect(sheet).toMatch(/IF THE TRIP GOES WELL.*A better pan.*80[.,]00/i);
	expect(sheet.indexOf('About')).toBeLessThan(sheet.search(/if the trip goes well/i));
});

/**
 * A line nobody is going to buy is archived from the list itself, without
 * leaving the shop for the room: it dims where it stands and can be put back.
 */
test('a line on the shopping list can be archived and put back from the list', async ({ page }) => {
	await register(page, testEmail('shop-archive'));
	await visit(page, '/inventory');

	await page.getByRole('button', { name: /Add item/ }).click();
	const form = page.getByRole('dialog');
	await form.locator('[name="label"]').fill('Oat milk');
	await form.locator('[name="idealQty"]').fill('2');
	await form.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(page.getByText('Oat milk')).toBeVisible();

	await page.getByRole('button', { name: /Shopping list/ }).click();
	const list = page.getByRole('dialog').filter({ hasText: 'Shopping list' });
	const line = list.getByRole('listitem').filter({ hasText: 'Oat milk' });

	await line.getByRole('button', { name: 'Archive: Oat milk' }).click();
	const back = line.getByRole('button', { name: 'Put it back on the list: Oat milk' });
	await expect(back).toBeVisible();
	// Still on the sheet, where the thumb left it.
	await expect(line).toBeVisible();

	// Archived for real: reopened, the list no longer has it.
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: /Shopping list/ }).click();
	await expect(list.getByText('Oat milk')).toHaveCount(0);
});
