import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * While the keyboard is up, the bottom bar is not.
 *
 * A phone does not resize the page when its keyboard opens: anything fixed to
 * the bottom stays where it was, over the field being typed into. "i am
 * typing, but the input is behind the bar, which is an issue, cuz i cant see."
 *
 * The keyboard itself cannot be raised from a test, so this drives the thing
 * the app actually reads — the visual viewport shrinking — and checks that the
 * bar steps off the screen.
 */
test('the bar steps off the screen while somebody is typing', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('keyboard-room'));
	await visit(page, '/tasks/todo');
	await page.waitForTimeout(800);

	const bar = page.locator('nav.mobile-nav');
	await expect(bar).toBeVisible();
	const before = await bar.boundingBox();
	expect(before!.y).toBeLessThan(844);

	// What a phone does when its keyboard opens: the visual viewport shrinks
	// while the window stays the height it was.
	await page.evaluate(() => {
		const view = window.visualViewport!;
		Object.defineProperty(view, 'height', { configurable: true, value: window.innerHeight - 320 });
		view.dispatchEvent(new Event('resize'));
	});
	await page.waitForTimeout(400);

	expect(await page.evaluate(() => document.documentElement.dataset.keyboard)).toBe('open');
	const after = await bar.boundingBox();
	// Off the bottom of the screen, rather than over the field.
	expect(after!.y).toBeGreaterThanOrEqual(844);
});
