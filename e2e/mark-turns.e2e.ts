import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The mark answers every route change, including the instant ones.
 *
 * The turn used to hang off `navigating` — a store that is set and cleared
 * again — and to sit still for a fraction of the room slide before moving. On
 * a desktop most navigations are over inside both, so the one thing on screen
 * saying "heard you" was invisible exactly when the app was quickest.
 *
 * Sampled rather than asserted at a moment: the turn is a few hundred
 * milliseconds and the only honest question is whether the mark moved at all
 * and came back upright.
 */
test('a route change turns the mark at least once, however quick it is', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('mark-turn'));
	await visit(page, '/');

	// The header's mark, which is the one a desktop sees. It turns whole.
	const mark = page.locator('header [data-mark]').first();
	await expect(mark).toBeAttached();
	// The load's own turn lands first, so the one below is the navigation's.
	await expect
		.poll(async () => mark.evaluate((el) => (el as HTMLElement).style.rotate), { timeout: 5000 })
		.toBe('');

	/** Every angle the mark is painted at while something is happening. */
	const watch = async (ms: number) => {
		const seen: number[] = [];
		const until = Date.now() + ms;
		while (Date.now() < until) {
			seen.push(
				await mark.evaluate((el) => {
					const said = (el as HTMLElement).style.rotate;
					return said ? parseFloat(said) : 0;
				})
			);
		}
		return seen;
	};

	const going = page.getByRole('link', { name: 'Goals' }).click();
	const seen = await watch(1500);
	await going;

	// It moved, and it went most of the way round rather than twitching.
	expect(Math.max(...seen), 'the mark never turned').toBeGreaterThan(300);

	// And it is upright again: `rest` takes the property off entirely.
	await expect
		.poll(async () => mark.evaluate((el) => (el as HTMLElement).style.rotate), { timeout: 5000 })
		.toBe('');
});

/**
 * The octagon turns, the bird inside stays upright, and the bar stays a bar.
 *
 * The bar once drew an octagon of its own colour behind the mark, a hair
 * larger; with the wheel open it stayed behind as a dark bump in a straight
 * bar. There is nothing behind the mark now, so the only thing that turns in
 * the bar is the mark's button, and the bird is turned back by as much.
 */
test('the octagon turns alone in the bar, and the bird does not', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('mark-bar'));
	// Somewhere other than home, so the bar's home link is a navigation.
	await visit(page, '/goals');

	// Nothing in the bar is drawn in the mark's shape but the mark itself.
	expect(await page.locator('nav [data-mark]').count()).toBe(1);

	/** Every element the turn has written a `rotate` on, with the bird's net angle. */
	const turned = async () =>
		page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('nav [style*="rotate"]')]
				.filter((el) => el.style.rotate)
				.map((el) => {
					const bird = el.querySelector<HTMLElement>('.mark-still');
					const net = bird
						? parseFloat(el.style.rotate) + parseFloat(getComputedStyle(bird).rotate || '0')
						: 0;
					return { tag: el.tagName.toLowerCase(), net };
				})
		);

	const going = page.getByRole('link', { name: 'Home' }).click();

	const tags = new Set<string>();
	let birdTurned = 0;
	const until = Date.now() + 1500;
	while (Date.now() < until) {
		for (const one of await turned()) {
			tags.add(one.tag);
			birdTurned = Math.max(birdTurned, Math.abs(one.net));
		}
	}
	await going;

	expect([...tags], 'the mark did not turn, or something else did').toEqual(['button']);
	expect(birdTurned, 'the bird turned with the octagon').toBeLessThan(0.01);
});
