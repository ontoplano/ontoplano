import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The mark in the middle of the phone bar stays in the middle of it.
 *
 * It did not while it was being pressed, which is the whole of the gesture:
 * `.tap-shape:active` said `transform: translate(-50%, 0) scale(0.92)` and the
 * centring is `left-1/2 -translate-x-1/2`, which Tailwind writes with the
 * `translate` property. The two compose rather than replace, so the -50% was
 * applied twice and the mark walked forty-two pixels left for as long as a
 * finger was on it — and the wheel, which is drawn around where the mark is
 * supposed to be, opened beside it.
 *
 * Invisible to every assertion about text, and it shipped in a screenshot on
 * the front page before anybody noticed.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('the mark is centred in the phone bar, pressed or not', async ({ page }) => {
	await register(page, `phone-bar-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const mark = page.locator('[aria-label="Go to a section"]');
	await expect(mark).toBeVisible();

	const centre = async () => {
		const box = (await mark.boundingBox())!;
		return box.x + box.width / 2;
	};

	const bar = (await page.locator('nav').last().boundingBox())!;
	const middle = bar.x + bar.width / 2;

	expect(Math.abs((await centre()) - middle)).toBeLessThan(2);

	// And while it is held, which is when the wheel is drawn around it.
	const box = (await mark.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(400);

	expect(
		Math.abs((await centre()) - middle),
		'the mark moved sideways while it was being pressed'
	).toBeLessThan(2);

	await page.mouse.up();
});
