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
