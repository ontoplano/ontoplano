import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

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
	await page.goto('/', { waitUntil: 'networkidle' });
	const nav = page.locator('nav');
	await expect(nav.getByRole('link', { name: 'Shopping' })).toBeVisible();

	// Put it away.
	await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
	const sections = page.locator('section', { hasText: 'Home and the planner are always on' });
	await sections.getByLabel('Shopping').uncheck();
	await sections.getByRole('button', { name: 'Save sections' }).click();
	await expect(page.getByText('Sections saved.')).toBeVisible();

	// Gone from the navbar…
	await page.goto('/', { waitUntil: 'networkidle' });
	await expect(nav.getByRole('link', { name: 'Shopping' })).toHaveCount(0);
	// …and its tab was not the only casualty check — a neighbour survives.
	await expect(nav.getByRole('link', { name: 'Recipes' })).toBeVisible();

	// Still answering at its URL: hidden, not blocked.
	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await expect(page).toHaveURL(/\/shopping/);
	await expect(page.getByRole('heading', { name: /shopping/i }).first()).toBeVisible();

	// And the toggle comes back on, bringing the tab with it.
	await page.goto('/settings/preferences', { waitUntil: 'networkidle' });
	await sections.getByLabel('Shopping').check();
	await sections.getByRole('button', { name: 'Save sections' }).click();
	await expect(page.getByText('Sections saved.')).toBeVisible();
	await page.goto('/', { waitUntil: 'networkidle' });
	await expect(nav.getByRole('link', { name: 'Shopping' })).toBeVisible();
});

/**
 * And the form is never emptied by saving it.
 *
 * SvelteKit's `enhance` calls `form.reset()` on a successful submit and then
 * awaits `invalidateAll()`. For a form you fill in that is right — the fields
 * clear. For one whose boxes are drawn from stored state it is wrong: Svelte
 * sets `checked` as a property and never writes the attribute, so `reset()`
 * returns every box to "unchecked" and they stay that way until the reload
 * lands. Over a real network that is long enough to read as "it cleared my
 * settings", which is how this was reported.
 *
 * The reload is blocked rather than delayed, so the assertion is about the
 * mechanism and not about a race: with the reset gone there is nothing to put
 * back, and the boxes are simply still right.
 */
test('saving the sections does not empty the boxes', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await register(page, `sections-keep-${Date.now()}@test.invalid`);
	await page.goto('/settings/preferences', { waitUntil: 'networkidle' });

	const sections = page.locator('section', { hasText: 'Home and the planner are always on' });
	await sections.getByLabel('Shopping').uncheck();

	// Nothing may repaint the form after the submit — no data reload, so no
	// re-render to hide a reset behind.
	await page.route('**/__data.json*', (route) => route.abort());
	await sections.getByRole('button', { name: 'Save sections' }).click();
	await page.waitForResponse((r) => r.url().includes('setSections'));
	await page.waitForTimeout(500);

	await expect(sections.getByLabel('Recipes')).toBeChecked();
	await expect(sections.getByLabel('Diary')).toBeChecked();
	await expect(sections.getByLabel('Shopping')).not.toBeChecked();

	// And the server kept what the screen is showing.
	await page.unroute('**/__data.json*');
	await page.reload({ waitUntil: 'networkidle' });
	await expect(sections.getByLabel('Shopping')).not.toBeChecked();
	await expect(sections.getByLabel('Recipes')).toBeChecked();
});
