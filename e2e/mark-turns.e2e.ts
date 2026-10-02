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

	// The header's mark, which is the one a desktop sees. Its rim is what turns.
	const mark = page.locator('header [data-mark] .mark-turn').first();
	await expect(mark).toBeAttached();
	/** How many turns the browser is playing on the rim. None is at rest. */
	const playing = () => mark.evaluate((el) => el.getAnimations().length);
	// The load's own turn lands first, so the one below is the navigation's.
	await expect.poll(playing, { timeout: 5000 }).toBe(0);

	/** Every angle the mark is painted at while something is happening. */
	const watch = async (ms: number) => {
		const seen: number[] = [];
		const until = Date.now() + ms;
		while (Date.now() < until) {
			seen.push(
				await mark.evaluate((el) => {
					const said = getComputedStyle(el).rotate;
					return said && said !== 'none' ? parseFloat(said) : 0;
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

	// And it is upright again: nothing is left playing on it.
	await expect.poll(playing, { timeout: 5000 }).toBe(0);
});

/**
 * The octagon turns, the bird inside does not, and the bar stays a bar.
 *
 * The bird used to be turned back by as much as the whole mark turned, on a
 * second animation — and every frame the two disagreed, the puffin moved. Now
 * only the rim is animated. So the question is not whether two angles cancel
 * but whether anything holding the bird is animated at all, sampled for the
 * whole of a navigation, and whether the bird's box ever moves.
 */
test('the rim turns alone in the bar, and nothing holding the bird does', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('mark-bar'));
	// Somewhere other than home, so the bar's home link is a navigation.
	await visit(page, '/goals');

	// Nothing in the bar is drawn in the mark's shape but the mark itself.
	expect(await page.locator('nav [data-mark]').count()).toBe(1);
	const bird = page.locator('nav [data-mark] .mark-still');
	const at = await bird.boundingBox();

	const sample = async () =>
		page.evaluate(() => {
			const turned = [...document.querySelectorAll<HTMLElement>('nav *')]
				// Animations, not transitions: the tab a press leaves fades its
				// colour as it stops being current, which turns nothing.
				.filter((el) =>
					el
						.getAnimations()
						.some((one) => one.playState === 'running' && !(one instanceof CSSTransition))
				)
				.map((el) => (el.matches('.mark-turn') ? 'mark-turn' : el.outerHTML.slice(0, 80)));
			const still = document.querySelector<HTMLElement>('nav [data-mark] .mark-still')!;
			let held = 0;
			for (let el: HTMLElement | null = still; el; el = el.parentElement) {
				const said = getComputedStyle(el).rotate;
				if (el.getAnimations().length > 0 || (said && said !== 'none')) held += 1;
			}
			const box = still.getBoundingClientRect();
			return { turned, held, x: box.x, y: box.y };
		});

	const going = page.getByRole('link', { name: 'Home' }).click();

	const turned = new Set<string>();
	let held = 0;
	let drift = 0;
	const until = Date.now() + 1500;
	while (Date.now() < until) {
		const one = await sample();
		one.turned.forEach((name) => turned.add(name));
		held = Math.max(held, one.held);
		drift = Math.max(drift, Math.abs(one.x - at!.x), Math.abs(one.y - at!.y));
	}
	await going;

	expect([...turned], 'the rim did not turn, or something else did').toEqual(['mark-turn']);
	expect(held, 'something holding the bird was turned').toBe(0);
	expect(drift, 'the bird moved').toBeLessThan(0.5);
});
