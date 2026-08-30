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
