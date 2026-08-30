import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The board's keyboard, where it destroys things.
 *
 * `x` was registered as "Ask to delete card", set a `confirmingDelete` flag,
 * and no markup read that flag any more — so the one keyboard path to deleting
 * a card silently did nothing, and the shortcut sheet advertised it anyway.
 * Found by a sweep of the shortcut registry rather than by anybody pressing it.
 *
 * These tests hold both halves of the rule at once: `x` has to visibly ask, and
 * `x` on its own must never delete. A keystroke that destroys a row is a
 * keystroke somebody makes by accident.
 */

async function newCard(page: import('@playwright/test').Page, title: string) {
	await page.goto('/planner/board', { waitUntil: 'networkidle' });
	await page.keyboard.press('n');
	await page.fill('#card-form input[name=title]', title);
	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
}

/** Put the board's keyboard focus on the card with this title. */
async function focusCard(page: import('@playwright/test').Page, title: string) {
	await page.getByText(title, { exact: true }).click();
}

test.describe('the board deletes by keyboard', () => {
	test('x asks, and does not delete on its own', async ({ page }) => {
		await register(page, `board-x-${Date.now()}@example.test`);
		const title = 'A card to be asked about';
		await newCard(page, title);
		await focusCard(page, title);

		await page.keyboard.press('x');

		// The question is on the card, not in a dialog over the pointer.
		await expect(page.getByText('Delete this?')).toBeVisible();
		// And the card is still there — asking is not doing.
		await expect(page.getByText(title, { exact: true })).toBeVisible();

		// A reload proves nothing was written, not merely that nothing redrew.
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	});

	test('Escape backs out of the question', async ({ page }) => {
		await register(page, `board-esc-${Date.now()}@example.test`);
		const title = 'A card that survives';
		await newCard(page, title);
		await focusCard(page, title);

		await page.keyboard.press('x');
		await expect(page.getByText('Delete this?')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByText('Delete this?')).toHaveCount(0);
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	});

	test('answering the question deletes the card', async ({ page }) => {
		await register(page, `board-del-${Date.now()}@example.test`);
		const title = 'A card that goes';
		await newCard(page, title);
		await focusCard(page, title);

		await page.keyboard.press('x');
		const confirm = page.getByRole('button', { name: 'Delete', exact: true });
		await expect(confirm).toBeVisible();

		// The button ignores its own first moments on purpose, so that the press
		// that opened the question cannot answer it. Wait it out rather than
		// racing it — a click that is swallowed is the guard working.
		await page.waitForTimeout(600);
		await confirm.click();

		await expect(page.getByText(title, { exact: true })).toHaveCount(0);
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.getByText(title, { exact: true })).toHaveCount(0);
	});
});
