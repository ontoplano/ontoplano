import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A hidden section is put away, not taken away.
 *
 * The claim the preference makes is exact: turning a section off removes it
 * from the menus — the navbar, the palette's places, the dashboard — while
 * the pages keep answering at their URLs and nothing is deleted. Both halves
 * need checking, because either alone is a different (and worse) feature:
 * menus without the pages is data loss, pages without the menus is a toggle
 * that does nothing.
 */

test('hiding a section empties the menus but not the URL', async ({ page }) => {
	// The tab row only exists at desktop width.
	await page.setViewportSize({ width: 1280, height: 800 });
	await register(page, `sections-${Date.now()}@test.invalid`);

	// Visible before: the tab, and the room itself.
	await visit(page, '/');
	const nav = page.locator('nav');
	await expect(nav.getByRole('link', { name: 'Inventory' })).toBeVisible();

	// Put it away. Order, colour and this are one list now, so it is one form.
	await visit(page, '/settings/preferences');
	const menu = page.locator('form[action="?/saveMenu"]');
	const inventory = menu.locator('div').filter({
		has: page.getByRole('button', { name: 'Move Inventory up' })
	});
	await inventory.getByRole('button', { name: 'Hide' }).click();
	await menu.getByRole('button', { name: 'Save menu' }).click();
	await expect(page.getByText('Menu saved.')).toBeVisible();

	// Gone from the navbar…
	await visit(page, '/');
	await expect(nav.getByRole('link', { name: 'Inventory' })).toHaveCount(0);
	// …and hiding one room did not take a neighbour with it.
	await expect(nav.getByRole('link', { name: 'Health' })).toBeVisible();

	// Still answering at its URL: hidden, not blocked.
	await visit(page, '/inventory/list');
	await expect(page).toHaveURL(/\/inventory/);
	await expect(page.getByRole('heading', { name: /inventory/i }).first()).toBeVisible();

	// And it comes back on, bringing the tab with it.
	await visit(page, '/settings/preferences');
	await page
		.locator('form[action="?/saveMenu"]')
		.getByRole('button', { name: 'Show' })
		.first()
		.click();
	await page
		.locator('form[action="?/saveMenu"]')
		.getByRole('button', { name: 'Save menu' })
		.click();
	await expect(page.getByText('Menu saved.')).toBeVisible();
	await visit(page, '/');
	await expect(nav.getByRole('link', { name: 'Inventory' })).toBeVisible();
});

/**
 * And the form is never emptied by saving it.
 *
 * SvelteKit's `enhance` calls `form.reset()` on a successful submit and then
 * awaits `invalidateAll()`. For a form you fill in that is right — the fields
 * clear. For one whose state is drawn from what is stored it is wrong: it
 * returns every control to its markup default and they stay that way until the
 * reload lands. Over a real network that is long enough to read as "it cleared
 * my settings", which is how this was reported.
 *
 * The reload is blocked rather than delayed, so the assertion is about the
 * mechanism and not about a race: with the reset gone there is nothing to put
 * back, and the list is simply still right.
 */
test('saving the menu does not empty the list', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await register(page, `sections-keep-${Date.now()}@test.invalid`);
	await visit(page, '/settings/preferences');

	const menu = page.locator('form[action="?/saveMenu"]');
	const inventory = menu.locator('div').filter({
		has: page.getByRole('button', { name: 'Move Inventory up' })
	});
	await inventory.getByRole('button', { name: 'Hide' }).click();

	// Nothing may repaint the form after the submit — no data reload, so no
	// re-render to hide a reset behind.
	await page.route('**/__data.json*', (route) => route.abort());
	await menu.getByRole('button', { name: 'Save menu' }).click();
	await page.waitForResponse((r) => r.url().includes('saveMenu'));
	await page.waitForTimeout(500);

	// Still put away, and every other room still listed.
	await expect(menu.getByRole('button', { name: 'Show' })).toHaveCount(1);
	// Six visible: seven rooms since People and Recipes became tabs of
	// Notebooks and Health, one of them put away.
	await expect(menu.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(6);
});
