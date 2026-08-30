import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The shell, held in a hand.
 *
 * Installed as a TWA this is an app, and the app-ness is specific things:
 * the bottom bar carries Home and raises the pie out of its middle, the pie
 * spends no wedge on Home, dragging past the top must not reload the page
 * (while the elastic stretch stays — `contain`, never `none`), and a dialog
 * arrives as a sheet with a handle, not a floating box.
 */

test.use({ viewport: { width: 390, height: 844 } });

test('the phone bar carries home and the raised pie; nothing pulls to refresh', async ({
	page
}) => {
	await register(page, `shell-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	const bar = page.locator('nav[aria-label="Primary"]');
	await expect(bar.getByRole('link', { name: 'Home' })).toBeVisible();
	await expect(bar.getByRole('button', { name: 'Go to a section' })).toBeVisible();

	// The refresh gesture dies at the scroller; the stretch survives because
	// this is `contain` — `none` would kill both.
	const behavior = await page.evaluate(() => ({
		root: getComputedStyle(document.documentElement).overscrollBehaviorY,
		main: getComputedStyle(document.querySelector('main')!).overscrollBehaviorY
	}));
	expect(behavior.root).toBe('contain');
	expect(behavior.main).toBe('contain');

	// The pie offers rooms, not Home — Home is a plain button now.
	await bar
		.getByRole('button', { name: 'Go to a section' })
		.dispatchEvent('pointerdown', { pointerId: 1, clientX: 195, clientY: 780 });
	await expect(page.locator('svg text', { hasText: 'Planner' }).first()).toBeVisible();
	await expect(page.locator('svg text', { hasText: 'Home' })).toHaveCount(0);
});

test('a dialog on the phone is a sheet with a handle', async ({ page }) => {
	await register(page, `sheet-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	// The capture tiles at the top of the phone dashboard open the shared
	// Modal, which below `sm` must present as a bottom sheet.
	await page.getByRole('button', { name: 'Idea' }).first().click();
	const dialog = page.locator('dialog[open]');
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('.sheet-handle')).toBeVisible();

	// It hugs the bottom edge, not the middle of the screen.
	const box = await dialog.locator('.panel').boundingBox();
	expect(box).toBeTruthy();
	expect(box!.y + box!.height).toBeGreaterThan(830);
});
