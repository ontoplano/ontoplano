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

test('a dialog on the phone is a screen with a back arrow', async ({ page }) => {
	await register(page, `sheet-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	// The capture tiles at the top of the phone dashboard open the shared
	// Modal, which below `sm` must present as a screen, not a floating card.
	await page.getByRole('button', { name: 'Idea' }).first().click();
	const dialog = page.locator('dialog[open]');
	await expect(dialog).toBeVisible();
	// A back arrow where a back arrow belongs, not an × in a corner.
	await expect(dialog.getByRole('button', { name: 'Back' })).toBeVisible();

	// It takes the screen: full width, top to bottom.
	const box = await dialog.locator('.panel').boundingBox();
	expect(box).toBeTruthy();
	expect(box!.width).toBeGreaterThan(380);
	expect(box!.height).toBeGreaterThan(800);

	// And the back arrow closes it.
	await dialog.getByRole('button', { name: 'Back' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('the phone has no top bar — the bottom one carries everything', async ({ page }) => {
	await register(page, `topbar-${Date.now()}@test.invalid`);
	await page.goto('/planner/plan', { waitUntil: 'networkidle' });

	// The wordmark header is desktop-only now: on a phone it spent a strip of
	// a small screen saying the app's own name.
	await expect(page.locator('header a', { hasText: 'ontoplano' })).toBeHidden();
	await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
});
