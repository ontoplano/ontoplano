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

/**
 * The screen owns a history entry.
 *
 * On Android the back gesture is how a screen is left, and a modal drawn as a
 * screen must answer it: back closes the form and stays in the app. Without
 * the entry, the gesture walked out of the page the form was on — the one
 * move that most says "this is a website".
 */
test('the system back gesture closes the screen, not the app', async ({ page }) => {
	await register(page, `back-${Date.now()}@test.invalid`);
	await visit(page, '/notebooks');

	// `.first()`: an account with no notebooks yet offers the button twice —
	// the header and the empty state.
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await expect(page.locator('dialog[open]')).toBeVisible();

	await page.goBack();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	// Still on the page the form was opened from.
	await expect(page).toHaveURL(/\/notebooks/);

	// Closing it by its own back arrow takes the entry out again: the next
	// back press must leave the page, not replay a ghost of the screen.
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await expect(page.locator('dialog[open]')).toBeVisible();
	await page.locator('dialog[open]').getByRole('button', { name: 'Back' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page).toHaveURL(/\/notebooks/);
});

/**
 * No side margins on a phone.
 *
 * A card spans the screen edge to edge below the phone breakpoint: the gutter
 * the shell pads the page with is exactly what the card bleeds back out, so a
 * 390px screen spends its width on the list, not on white space either side.
 */
test('a card takes the whole width of the phone', async ({ page }) => {
	await register(page, `bleed-${Date.now()}@test.invalid`);
	await visit(page, '/notebooks');

	const card = page.locator('main .shadow-card').first();
	const box = await card.boundingBox();
	expect(box).toBeTruthy();
	expect(box!.x).toBe(0);
	expect(box!.width).toBe(390);

	// The page must not gain a sideways scroll from the bleed.
	const overflow = await page.evaluate(() => {
		const main = document.querySelector('main')!;
		return main.scrollWidth - main.clientWidth;
	});
	expect(overflow).toBe(0);
});

test('the phone carries the room at the top and the app at the bottom', async ({ page }) => {
	await register(page, `topbar-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan');

	// The wordmark header is desktop-only: on a phone it spent a strip of a
	// small screen saying the app's own name.
	await expect(page.locator('header a', { hasText: 'ontoplano' })).toBeHidden();
	await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();

	// What is at the top instead is where you are: the room's name, its tabs,
	// and the way home — and it stays there while the room scrolls under it,
	// which is most of what makes this feel like an app rather than a page.
	const bar = page.locator('.room-bar');
	await expect(bar).toBeVisible();
	await expect(bar.getByRole('link', { name: 'Back to today' })).toBeVisible();
	await expect(bar.getByRole('heading', { name: 'Tasks' })).toBeVisible();

	const before = await bar.boundingBox();
	await page.locator('main').evaluate((m) => m.scrollBy(0, 400));
	await page.waitForTimeout(300);
	expect(await bar.boundingBox()).toMatchObject({ y: before!.y });
});

/**
 * The phone can sign out.
 *
 * The desktop keeps Sign out in the header menu; the bottom bar has no menu,
 * so for weeks a phone simply had no door out. It lives on the account page
 * now, above the delete card.
 */
test('the account page signs a phone out', async ({ page }) => {
	await register(page, `phone-out-${Date.now()}@example.test`);
	await page.setViewportSize({ width: 390, height: 800 });
	await visit(page, '/settings/account');

	await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
	await page.waitForTimeout(1000);
	// Signed out means the door: the login page, not an error and not a stale app shell.
	await expect(page.getByRole('button', { name: /Sign in|Create account/ }).first()).toBeVisible({
		timeout: 10000
	});
});
