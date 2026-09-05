import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

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
	await visit(page, '/');

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

	/*
	 * The pie offers rooms, not Home — Home is a plain button in the bar.
	 *
	 * The wedges carry icons here rather than names: the finger covers the one
	 * it is on, so the name is drawn at the top of the screen instead. Aiming at
	 * a wedge is therefore how you ask what it is.
	 */
	await bar
		.getByRole('button', { name: 'Go to a section' })
		.dispatchEvent('pointerdown', { pointerId: 1, clientX: 195, clientY: 780 });

	const wedges = page.locator('.pie [role="menuitem"]');
	await expect(wedges.first()).toBeVisible();

	const named: string[] = [];
	for (let i = 0; i < (await wedges.count()); i += 1) {
		await wedges.nth(i).hover();
		named.push(((await page.locator('.pie-hud').textContent()) ?? '').trim());
	}
	expect(named).toContain('Tasks');
	expect(named, 'Home is a button in the bar, not a wedge').not.toContain('Home');
});

test('a dialog on the phone is a screen with a back arrow', async ({ page }) => {
	await register(page, `sheet-${Date.now()}@test.invalid`);
	await visit(page, '/');

	/*
	 * The capture pie in the bottom bar opens the shared Modal, which below
	 * `sm` must present as a screen rather than a floating card.
	 *
	 * It used to be the four tiles at the top of the dashboard. They are gone:
	 * the pie is the same four, under the thumb, and costs no room on the page.
	 */
	const plus = page.getByRole('button', { name: /write something down/i }).first();
	await plus.hover();
	await page.mouse.down();
	await page.mouse.up();
	await page.locator('.pie [role="menuitem"]').first().click();
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
	await visit(page, '/tasks/plan');

	// The wordmark header is desktop-only now: on a phone it spent a strip of
	// a small screen saying the app's own name.
	await expect(page.locator('header a', { hasText: 'ontoplano' })).toBeHidden();
	await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
});
