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

	// The header's mark, which is the one a desktop sees.
	const mark = page.locator('header [data-mark] .mark-turn').first();
	await expect(mark).toBeAttached();

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
 * And nothing else on the page turns with it.
 *
 * The phone bar draws an octagon of flat colour behind the mark's button, a
 * hair larger, so the clipped button has an edge to end at. It used to be
 * turned along with the mark — correct while the whole mark turned, and wrong
 * ever since the turn became a disc inside the ring: an octagon revolving
 * behind one that is standing still swings its corners out past the rim, and
 * the ground is a colour meant never to be seen as a shape.
 *
 * Asked of the page rather than of that one element, because the rule is the
 * general one: the medallion turns and nothing else does, whatever else a
 * caller hands to `startMarkSpin`.
 */
test('and nothing behind it turns', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('mark-ground'));
	// Somewhere other than home, so the bar's home link is a navigation.
	await visit(page, '/goals');

	/** Everything the turn has written a `rotate` on, medallion or not. */
	const turned = async () =>
		page.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('[style*="rotate"]')]
				.filter((el) => el.style.rotate)
				.map((el) => (el.classList.contains('mark-turn') ? 'medallion' : el.tagName.toLowerCase()))
		);

	const going = page.getByRole('link', { name: 'Home' }).click();

	const seen = new Set<string>();
	const until = Date.now() + 1500;
	while (Date.now() < until) for (const one of await turned()) seen.add(one);
	await going;

	// The medallion, and nothing else. Both halves matter: without the first
	// this passes on a bar that never turned at all.
	expect([...seen].sort(), 'the medallion did not turn, or something else did').toEqual([
		'medallion'
	]);
});
