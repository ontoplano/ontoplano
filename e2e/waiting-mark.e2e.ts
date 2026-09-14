import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The wait is the menu, turning.
 *
 * Nothing is spawned while a navigation is in flight: the mark that opens the
 * rooms — already in the header, already the raised button in the phone bar —
 * is the thing that turns. So what is tested is that the mark the screen
 * already has picks up the turn while a navigation drags, and puts it down
 * when the page lands.
 *
 * The navigation is made to drag by holding its response, because against a
 * local server a room loads inside the slide — which is exactly why the delay
 * exists, and why an unheld navigation must never visibly spin.
 */
test('the header mark turns while a navigation drags, and stops when it lands', async ({
	page
}) => {
	await register(page, `menu-turn-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/todo');

	/*
	 * The app's service worker fetches pages itself, and requests a service
	 * worker makes cannot be held by route interception — so the hold below
	 * would silently not hold. The worker is not what is being tested; out it
	 * goes for this page.
	 */
	await page.evaluate(async () => {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((r) => r.unregister()));
	});
	await visit(page, '/tasks/todo');

	const mark = page.locator('header [data-tour=rooms]');
	await expect(mark).toBeVisible();

	// Nothing in flight: the menu holds still.
	await expect(mark).not.toHaveClass(/mark-waiting/);

	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/goals**', async (route) => {
		await held;
		await route.continue();
	});

	await page.getByRole('link', { name: 'Goals' }).click();
	await expect(mark).toHaveClass(/mark-waiting/);
	// And the class is wired to a real animation, not a name lost in a rename.
	await expect
		.poll(() => mark.evaluate((el) => getComputedStyle(el).animationName))
		.toContain('mark-turn');

	// Let the page land: the held response goes through, the class comes off.
	release();
	await expect(mark).not.toHaveClass(/mark-waiting/);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the turn belongs to the raised mark in the bar, translate intact', async ({ page }) => {
		await register(page, `bar-turn-${Date.now()}@test.invalid`);
		await visit(page, '/tasks/todo');

		const mark = page.locator('nav [data-tour=rooms]');
		await expect(mark).toBeVisible();
		await expect(mark).not.toHaveClass(/bar-mark-waiting/);

		/*
		 * The animation is checked with the class applied directly: on a phone
		 * the way between rooms is the wheel, and driving a full gesture to hold
		 * a navigation open buys nothing over asking whether the CSS the class
		 * names still exists and still carries the centring translate — losing
		 * that translate is the failure this guards (the button walks off to
		 * the right while it spins).
		 */
		const spun = await mark.evaluate((el) => {
			el.classList.add('bar-mark-waiting');
			const style = getComputedStyle(el);
			return { animation: style.animationName, transform: style.transform };
		});
		expect(spun.animation).toContain('bar-mark-turn');

		const still = await page.evaluate(() => {
			const el = document.querySelector('nav [data-tour=rooms]')!;
			el.classList.remove('bar-mark-waiting');
			return getComputedStyle(el).transform;
		});
		// With and without the animation, the button is centred by the same
		// translate: half its own width to the left.
		expect(still).toBe(spun.transform);
	});
});
