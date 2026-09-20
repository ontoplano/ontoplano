import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The board, for a finger and for anybody who wants to read a card.
 *
 * HTML5 drag-and-drop does not exist on a touch screen, so the one thing this
 * room is for — put this card in that column — could not be done on a phone at
 * all. Pressing a card's grip arms it and the next press on a column places
 * it, which is the gesture the planner's todo rail already uses and which
 * works with a mouse too.
 *
 * And a card said its title and nothing else: the only way to read the notes
 * under it was to open the form that edits it and press Cancel.
 */
async function newCard(page: Page, title: string, notes: string) {
	await visit(page, '/tasks/board');
	await page.keyboard.press('n');
	const heading = page.locator('#card-form [name=heading]');
	await expect(heading).toBeVisible({ timeout: 15_000 });
	await heading.fill(title);
	// The notes box is behind the compact form's disclosure, which is a
	// `<summary>` — not a button, whatever it looks like.
	await page.locator('#card-form summary').first().click();
	await page.locator('#card-form [name=notes]').fill(notes);
	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test('a card can be carried to another column without a drag', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('board-carry'));
	await newCard(page, 'ring the plumber', 'after 9pm');

	const card = page.locator('article', { hasText: 'ring the plumber' }).first();
	await expect(card).toBeVisible();

	// Pick it up. The board says what is in your hand, by name.
	await card.getByRole('button', { name: /Move this to another column/ }).click();
	await expect(page.getByText(/Moving .*ring the plumber/)).toBeVisible();

	// And the columns say they will take it.
	await expect(page.locator('.is-landing').first()).toBeVisible();

	// Put it down. On a phone the names above the columns are the target.
	await page.getByRole('button', { name: /^Doing/ }).click();
	await expect(page.getByText(/Moving /)).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Doing\s*1/ })).toBeVisible();
});

test('the move can be put back down without going anywhere', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('board-cancel'));
	await newCard(page, 'ring the plumber', 'after 9pm');

	const card = page.locator('article', { hasText: 'ring the plumber' }).first();
	await card.getByRole('button', { name: /Move this to another column/ }).click();
	await expect(page.getByText(/Moving /)).toBeVisible();

	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByText(/Moving /)).toHaveCount(0);
	await expect(page.locator('.is-landing')).toHaveCount(0);
});

test('pressing a card reads it, without the form that edits it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('board-read'));
	await newCard(page, 'ring the plumber', 'the boiler makes a noise after 9pm');

	const card = page.locator('article', { hasText: 'ring the plumber' }).first();
	await expect(page.getByText('the boiler makes a noise after 9pm')).toHaveCount(0);

	await card.click();
	await expect(page.getByText('the boiler makes a noise after 9pm')).toBeVisible();
	await expect(page.locator('#edit-form')).toHaveCount(0);

	await card.click();
	await expect(page.getByText('the boiler makes a noise after 9pm')).toHaveCount(0);
});
