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
 * The octagon turns with its ground, and the bird inside stays upright.
 *
 * The phone bar draws an octagon of flat colour behind the mark's button, a
 * hair larger, so the clipped button has an edge to end at. Standing still
 * behind a turning mark it would show the mark's corners sweeping past it, so
 * the two turn together, by the same angle. The bird is turned back by the
 * same angle in CSS, which is what keeps it still.
 */
test('the octagon and its ground turn together, and the bird does not', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('mark-ground'));
	// Somewhere other than home, so the bar's home link is a navigation.
	await visit(page, '/goals');

	/** Every element the turn has written a `rotate` on, with the bird's net angle. */
	const turned = async () =>
		page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('nav [data-mark]')]
				.filter((el) => el.style.rotate)
				.map((el) => {
					const bird = el.querySelector<HTMLElement>('.mark-still');
					const net = bird
						? parseFloat(el.style.rotate) + parseFloat(getComputedStyle(bird).rotate || '0')
						: 0;
					return { tag: el.tagName.toLowerCase(), angle: parseFloat(el.style.rotate), net };
				})
		);

	const going = page.getByRole('link', { name: 'Home' }).click();

	const tags = new Set<string>();
	let apart = 0;
	let birdTurned = 0;
	const until = Date.now() + 1500;
	while (Date.now() < until) {
		const now = await turned();
		for (const one of now) {
			tags.add(one.tag);
			birdTurned = Math.max(birdTurned, Math.abs(one.net));
		}
		if (now.length === 2) apart = Math.max(apart, Math.abs(now[0].angle - now[1].angle));
	}
	await going;

	expect([...tags].sort(), 'the button or its ground did not turn').toEqual(['button', 'span']);
	expect(apart, 'the ground and the mark turned out of step').toBeLessThan(0.01);
	expect(birdTurned, 'the bird turned with the octagon').toBeLessThan(0.01);
});
