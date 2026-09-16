import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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
	await register(page, testEmail('assistant-key'));
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
	for (const client of ['Claude', 'Codex', 'Cursor']) {
		await page.getByRole('button', { name: client, exact: true }).click();
		for (const snippet of await page
			.locator('pre', { hasText: /\/api\/mcp|\/plugin install/ })
			.allInnerTexts()) {
			expect(snippet, `${client} snippet`).toContain(shown);
		}
	}

	/*
	 * And Claude is ONE tab carrying its three ways in, not three tabs.
	 *
	 * It was three of the six — plugin, command line, desktop — which turned
	 * "which assistant do you use?" into a row mostly about installing one of
	 * them, with Codex and Cursor at the end of it.
	 */
	await page.getByRole('button', { name: 'Claude', exact: true }).click();
	for (const way of ['The plugin', 'The command line', 'The desktop app']) {
		await expect(page.getByRole('heading', { name: way })).toBeVisible();
	}
	for (const gone of ['Claude Code (plugin)', 'Claude Code (by hand)', 'Claude Desktop']) {
		await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
	}

	/*
	 * The snippets are the permanent versions, and the page says where the
	 * whole story is. "Give once and have it work forever" is the promise:
	 * a scope that covers every project, a key that outlives the shell it
	 * was typed into, and a link to the docs page that shows each client's
	 * own way of keeping it.
	 */
	await page.getByRole('button', { name: 'Claude', exact: true }).click();
	expect(await page.locator('pre', { hasText: 'claude mcp add' }).first().innerText()).toContain(
		'--scope user'
	);

	await page.getByRole('button', { name: 'Codex', exact: true }).click();
	expect(
		await page.locator('pre', { hasText: 'mcp_servers.ontoplano' }).first().innerText()
	).toContain('shell profile');

	const how = page.getByRole('link', { name: /set each one up permanently/ });
	await expect(how).toBeVisible();
	await expect(how).toHaveAttribute('href', /\/ai-agents#connect-it$/);
});
