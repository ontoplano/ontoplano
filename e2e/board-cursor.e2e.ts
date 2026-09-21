import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The board says which card the keyboard is on.
 *
 * j and k moved the cursor and nothing on the screen changed: the cards paint
 * their own face from the category's colour, which won over the cursor's grey.
 */
test('moving with j and k shows where you are', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('board-cursor'));

	await visit(page, '/tasks/board');
	await page.waitForTimeout(1500);
	const cards = page.locator('article.pill-soft');
	const many = await cards.count();
	test.skip(many < 2, 'the seeded day has fewer than two cards to move between');

	await page.keyboard.press('j');
	await page.waitForTimeout(300);
	const first = await page
		.locator('.kbd-cursor')
		.first()
		.evaluate((el) => getComputedStyle(el).boxShadow);

	// The card the cursor is on is drawn differently from one it is not.
	const others = await cards
		.filter({ hasNot: page.locator('.kbd-cursor') })
		.first()
		.evaluate((el) => getComputedStyle(el).boxShadow);

	expect(first).not.toBe('none');
	expect(first).not.toBe(others);

	// And it moves: the card that had it does not keep it.
	const wasOn = await page.locator('.kbd-cursor').first().innerText();
	await page.keyboard.press('j');
	await page.waitForTimeout(300);
	expect(await page.locator('.kbd-cursor').first().innerText()).not.toBe(wasOn);
});
