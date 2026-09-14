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

	test('the turn belongs to the raised mark in the bar, and it turns in place', async ({
		page
	}) => {
		await register(page, `bar-turn-${Date.now()}@test.invalid`);
		await visit(page, '/tasks/todo');

		const mark = page.locator('nav [data-tour=rooms]');
		await expect(mark).toBeVisible();
		await expect(mark).not.toHaveClass(/mark-waiting/);

		/*
		 * The class is applied directly: on a phone the way between rooms is the
		 * wheel, and driving a full gesture buys nothing over asking whether the
		 * CSS the class names still exists and still spins the button where it
		 * stands. The failure this guards is real: keyframes that drove
		 * `transform` stacked a second centring translate on top of the
		 * `translate` property and sent the mark wandering across the bar.
		 */
		const before = await mark.boundingBox();
		await mark.evaluate((el) => el.classList.add('mark-waiting'));
		await expect
			.poll(() => mark.evaluate((el) => getComputedStyle(el).animationName))
			.toContain('mark-turn');

		// Sampled mid-spin, more than the delay in: the centre has not moved.
		await page.waitForTimeout(600);
		const during = await mark.boundingBox();
		expect(Math.abs(during!.x + during!.width / 2 - (before!.x + before!.width / 2))).toBeLessThan(
			2
		);
		expect(
			Math.abs(during!.y + during!.height / 2 - (before!.y + before!.height / 2))
		).toBeLessThan(2);
	});
});
