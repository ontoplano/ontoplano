import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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
	await register(page, testEmail('menu-turn'));
	await visit(page, '/tasks/todo');

	await page.evaluate(async () => {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((r) => r.unregister()));
	});
	await visit(page, '/tasks/todo');

	const mark = page.locator('header [data-tour=rooms] .mark-turn');
	await expect(mark).toBeVisible();

	const angle = () =>
		mark.evaluate((el) =>
			(el as HTMLElement).style.rotate ? parseFloat((el as HTMLElement).style.rotate) : null
		);

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

	test('only the medallion turns in the bar; the button stands still', async ({ page }) => {
		await register(page, testEmail('bar-turn'));
		await visit(page, '/tasks/todo');

		const button = page.locator('nav [data-tour=rooms]');
		await expect(button).toBeVisible();
		const medallion = button.locator('.mark-turn');
		await expect(medallion).toHaveCount(1);
		// A disc: the one shape that turns without clipping or revealing.
		expect(await medallion.evaluate((el) => (el as HTMLElement).style.clipPath)).toContain(
			'circle'
		);

		// Turning the medallion moves nothing: not itself off-centre, and not
		// the button around it.
		const before = await button.boundingBox();
		await medallion.evaluate((el) => ((el as HTMLElement).style.rotate = '137deg'));
		const during = await button.boundingBox();
		expect(Math.abs(during!.x - before!.x)).toBeLessThan(1);
		expect(Math.abs(during!.y - before!.y)).toBeLessThan(1);
	});
});
