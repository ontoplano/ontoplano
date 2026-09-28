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

	const mark = page.locator('header [data-tour=rooms]');
	await expect(mark).toBeVisible();

	const angle = () =>
		mark.evaluate((el) =>
			(el as HTMLElement).style.rotate ? parseFloat((el as HTMLElement).style.rotate) : null
		);

	// Once the load's own turn has landed, the mark stands still, wearing no
	// rotation at all.
	await expect.poll(angle, { timeout: 5000 }).toBeNull();

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

	test('the octagon turns in the bar and the bird stays where it is', async ({ page }) => {
		await register(page, testEmail('bar-turn'));
		await visit(page, '/tasks/todo');

		const button = page.locator('nav [data-tour=rooms]');
		await expect(button).toBeVisible();
		const bird = button.locator('.mark-still');
		await expect(bird).toHaveCount(1);
		// A disc: the one shape that can be turned back inside a turning octagon
		// without its edge showing.
		expect(await bird.evaluate((el) => (el as HTMLElement).style.clipPath)).toContain('circle');

		// Turned as the spin turns it: the button about its own centre, and the
		// bird back by as much, so it ends where it began.
		const before = await button.boundingBox();
		const birdBefore = await bird.boundingBox();
		await button.evaluate((el) => {
			(el as HTMLElement).style.rotate = '137deg';
			(el as HTMLElement).style.setProperty('--mark-turn', '137deg');
		});
		await expect.poll(() => bird.evaluate((el) => getComputedStyle(el).rotate)).toBe('-137deg');
		const birdDuring = await bird.boundingBox();
		const during = await button.boundingBox();
		const centre = (b: { x: number; y: number; width: number; height: number }) => [
			b.x + b.width / 2,
			b.y + b.height / 2
		];
		for (const [was, now] of [
			[before!, during!],
			[birdBefore!, birdDuring!]
		]) {
			const [ax, ay] = centre(was);
			const [bx, by] = centre(now);
			expect(Math.abs(ax - bx)).toBeLessThan(1);
			expect(Math.abs(ay - by)).toBeLessThan(1);
		}
		expect(Math.abs(birdDuring!.width - birdBefore!.width)).toBeLessThan(1);
	});
});
