import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Making a key for an assistant, and the paste it produces.
 *
 * The two halves have to agree: a key shown once, and the words underneath it
 * carrying that same key. They were separate things on separate pages before,
 * and the command only existed for the one render after a token was minted —
 * which is exactly the arrangement where the two drift apart and nobody
 * notices until somebody pastes a prompt with `YOUR_KEY` still in it.
 */
test('a key made on the AI tab arrives inside the words you paste', async ({ page }) => {
	await register(page, `assistant-key-${Date.now()}@test.invalid`);
	await visit(page, '/settings/integrations');

	// The button exists before the page has hydrated enough to obey it.
	await expect(async () => {
		await page.getByRole('button', { name: 'Make a key' }).click();
		await expect(page.locator('input[name="label"]')).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 15000 });

	/*
	 * The permissions are the caller's to change, which is the whole reason
	 * they are drawn — and every one of them starts ticked, because the set an
	 * assistant uses is the set an assistant uses.
	 */
	const boxes = page.locator('input[name="scopes"]');
	const count = await boxes.count();
	expect(count).toBeGreaterThan(1);
	for (let i = 0; i < count; i++) await expect(boxes.nth(i)).toBeChecked();

	// And deleting is not among them: this form does not offer it at all.
	await expect(page.locator('input[name="scopes"][value="destructive"]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Make it' }).click();
	await page.waitForTimeout(1200);

	const shown = await page.locator('code').first().innerText();
	expect(shown).toMatch(/^onto_/);

	/*
	 * The same key, in the thing somebody actually copies. Read from the page
	 * rather than from the clipboard: the clipboard needs a permission the
	 * headless browser will not always grant, and what is on screen is what
	 * gets pasted either way.
	 */
	const words = await page.locator('code', { hasText: 'Address:' }).first().innerText();
	expect(words).toContain(shown);
	expect(words).not.toContain('YOUR_KEY');
});
