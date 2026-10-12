import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A key the input method has taken is not a shortcut.
 *
 * In Japanese, Chinese or Korean the keys build a word before it exists, and
 * Enter confirms it; Android's keyboards compose Latin words the same way. A
 * press that arrives mid-word must reach nothing in the app — here, `n` on the
 * board, which otherwise opens the new-card form. `$lib/composition`.
 */
test('a key pressed while a word is composed opens nothing', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('composition'));
	await visit(page, '/calendar/board');
	const form = page.locator('#card-form [name=heading]');

	for (const composing of [{ isComposing: true }, { keyCode: 229 }]) {
		await page.evaluate((init) => {
			const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true, ...init });
			if ('keyCode' in init) Object.defineProperty(event, 'keyCode', { value: init.keyCode });
			document.body.dispatchEvent(event);
		}, composing);
		await page.waitForTimeout(400);
		await expect(form).toBeHidden();
	}

	// The same key, typed plainly, still does what it says.
	await page.keyboard.press('n');
	await expect(form).toBeVisible({ timeout: 15_000 });
});
