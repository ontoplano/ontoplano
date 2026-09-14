import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The wait is the menu, turning — and landing on its feet.
 *
 * Nothing is spawned while a navigation is in flight: the mark that opens the
 * rooms — the header's, and the raised button in the phone bar — turns in
 * place, driven by `$lib/mark-spin`. When the page lands the turn is not cut
 * off: it carries on to the next full turn and rests upright, which is the
 * difference between "done" and a flick.
 *
 * The navigation is made to drag by holding its response, and the app's
 * service worker is unregistered first because requests a service worker
 * makes cannot be held by route interception — the hold would silently not
 * hold.
 */
test('the header mark turns while a navigation drags, then finishes its turn upright', async ({
	page
}) => {
	await register(page, `menu-turn-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/todo');

	await page.evaluate(async () => {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((r) => r.unregister()));
	});
	await visit(page, '/tasks/todo');

	const mark = page.locator('header [data-tour=rooms]');
	await expect(mark).toBeVisible();

	const angle = () => mark.evaluate((el) => (el.style.rotate ? parseFloat(el.style.rotate) : null));

	// Nothing in flight: the mark stands still, wearing no rotation at all.
	expect(await angle()).toBeNull();

	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/goals**', async (route) => {
		await held;
		await route.continue();
	});

	await page.getByRole('link', { name: 'Goals' }).click();

	// Turning: the angle exists and grows.
	await expect.poll(angle).toBeGreaterThan(0);
	const early = (await angle())!;
	await expect.poll(angle).toBeGreaterThan(early);

	// Let the page land mid-turn. The turn keeps going — through at least the
	// angle it was at — and then rests: the style comes off entirely, which is
	// upright, rather than snapping there from wherever it was.
	release();
	await expect.poll(angle, { timeout: 5000 }).toBeNull();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the raised mark in the bar turns in place', async ({ page }) => {
		await register(page, `bar-turn-${Date.now()}@test.invalid`);
		await visit(page, '/tasks/todo');

		const mark = page.locator('nav [data-tour=rooms]');
		await expect(mark).toBeVisible();

		/*
		 * The rotation is applied directly: on a phone the way between rooms is
		 * the wheel, and driving a full gesture buys nothing over the property
		 * this guards — `rotate` composes after the `translate` that centres
		 * the button, so a turned mark is exactly where the resting one is. A
		 * turn written into `transform` instead stacked a second centring
		 * translate and sent the mark wandering across the bar.
		 */
		const before = await mark.boundingBox();
		await mark.evaluate((el) => (el.style.rotate = '137deg'));
		const during = await mark.boundingBox();
		expect(Math.abs(during!.x + during!.width / 2 - (before!.x + before!.width / 2))).toBeLessThan(
			2
		);
		expect(
			Math.abs(during!.y + during!.height / 2 - (before!.y + before!.height / 2))
		).toBeLessThan(2);
	});
});
