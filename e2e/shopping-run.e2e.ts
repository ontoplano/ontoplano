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
	// How many you keep, the price and the kind live behind the disclosure —
	// see `BuyFields`: capture is one line, the rest is one press away.
	await form
		.getByRole('button', { name: /More|options/i })
		.first()
		.click();
	await form.locator('[name="idealQty"]').fill('4');
	await form.locator('[name="price"]').fill('2.50');
	await form.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(page.getByText('Tinned tomatoes')).toBeVisible();

	// And something for the someday list, which is not part of the trip.
	await page.getByRole('button', { name: /Add item/ }).click();
	const wish = page.getByRole('dialog');
	await wish.locator('[name="label"]').fill('A better pan');
	await wish
		.getByRole('button', { name: /More|options/i })
		.first()
		.click();
	await wish.locator('[name="type"]').selectOption('someday');
	await wish.locator('[name="price"]').fill('80.00');
	await wish.getByRole('button', { name: 'Add item', exact: true }).click();
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
