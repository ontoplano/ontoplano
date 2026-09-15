import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The ordinary app wears the mark in colour.
 *
 * The instance that runs on a device drains the colour out of the mark in its
 * main menu, so that somebody running both can tell at a glance which one they
 * are writing into. This is the other half of that: the copy behind a server —
 * the one nearly everybody has — is untouched by it. A "this is the unusual
 * one" signal that also appears on the usual one says nothing at all.
 */
test('the wheel’s mark keeps its colours in the served app', async ({ page }) => {
	await register(page, `mark-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const handle = page.getByRole('button', { name: 'Jump to a section' });
	const box = await handle.boundingBox();
	if (!box) throw new Error('the menu has no handle to press');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();

	const mark = page.locator('.pie-mark image').first();
	await expect(mark).toBeVisible();
	expect(await mark.evaluate((el) => getComputedStyle(el).filter)).toBe('none');

	await page.mouse.up();
});
