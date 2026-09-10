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
		// A OneLine (a textarea that behaves like an input), found by its accessible
		// name so the selector survives whichever element backs it.
		await expect(page.getByRole('textbox', { name: 'What to call this key' })).toBeVisible({
			timeout: 2000
		});
	}).toPass({ timeout: 15000 });

	/*
	 * The permissions are the caller's to change, which is the whole reason
	 * they are drawn — and every one of them starts ticked, because the set an
	 * assistant uses is the set an assistant uses.
	 */
	const boxes = page.locator('input[name="scopes"]:not([value="destructive"])');
	const count = await boxes.count();
	expect(count).toBeGreaterThan(1);
	for (let i = 0; i < count; i++) await expect(boxes.nth(i)).toBeChecked();

	/*
	 * Deleting is offered and is not ticked. It is the one grant somebody has
	 * to reach for, so a default that ever flips to ticked is the failure this
	 * guards — and a pair that cannot exist is drawn as a box that cannot be
	 * pressed rather than as an empty cell.
	 */
	const destructive = page.locator('input[name="scopes"][value="destructive"]');
	await expect(destructive).toHaveCount(1);
	await expect(destructive).not.toBeChecked();
	expect(await page.locator('input[type="checkbox"][disabled]').count()).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Make it' }).click();
	await page.waitForTimeout(1200);

	const shown = (
		await page
			.locator('pre', { hasText: /^onto_/ })
			.first()
			.innerText()
	).trim();
	expect(shown).toMatch(/^onto_/);

	/*
	 * The same key, in the thing somebody actually copies. Read from the page
	 * rather than from the clipboard: the clipboard needs a permission the
	 * headless browser will not always grant, and what is on screen is what
	 * gets pasted either way.
	 */
	const words = await page.locator('pre', { hasText: 'Address:' }).first().innerText();
	expect(words).toContain(shown);
	expect(words).not.toContain('YOUR_KEY');

	/*
	 * And every client's snippet carries it, not just the one on screen when
	 * the key was made. The picker was added because "one command" covered
	 * Claude Code and nothing else; a snippet that still says YOUR_KEY after a
	 * key exists is the same failure wearing a different name.
	 */
	for (const client of ['Claude Code', 'Codex', 'Cursor', 'Claude Desktop']) {
		await page.getByRole('button', { name: client, exact: true }).click();
		const snippet = await page.locator('pre', { hasText: '/api/mcp' }).first().innerText();
		expect(snippet, `${client} snippet`).toContain(shown);
	}
});
