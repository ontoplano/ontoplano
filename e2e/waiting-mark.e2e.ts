import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The mark that turns while you wait sits in one place, whatever page it is
 * waiting on top of.
 *
 * It was positioned at 25% of the frame — and the frame is held at the height
 * of whatever screen just left, so a quarter of the way down a settings page
 * three screens tall is a different place from a quarter of the way down a
 * short one. It moved between every navigation, and starting from halfway down
 * a long page it was above the top of the window, waiting where nobody could
 * see it. Horizontally it never moved, because that half was centred rather
 * than measured off the page.
 *
 * The element is put on the frame here rather than caught mid-navigation: a
 * room loads in a few milliseconds against a local server, and the property
 * being checked is where the app's own CSS puts this element, which does not
 * depend on how it came to be there.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Where the mark lands on the screen, and how tall the page under it is. */
const WHERE = `(() => {
	const frame = document.querySelector('.slide-frame');
	let mark = document.querySelector('.nav-waiting');
	if (!mark) {
		mark = document.createElement('div');
		mark.className = 'nav-waiting';
		mark.style.setProperty('--nav-waiting-delay', '0ms');
		mark.innerHTML = '<div style="width:40px;height:40px"></div>';
		frame.append(mark);
	}
	const box = mark.firstElementChild.getBoundingClientRect();
	return {
		top: Math.round(box.top),
		centre: Math.round(box.left + box.width / 2),
		inTheWindow: box.top >= 0 && box.bottom <= window.innerHeight,
		frame: Math.round(frame.getBoundingClientRect().height)
	};
})()`;

test('the waiting mark is in the same place on every page', async ({ page }) => {
	await register(page, `wait-${Date.now()}@test.invalid`);

	const seen: { top: number; centre: number; frame: number }[] = [];
	for (const where of ['/tasks/board', '/settings/account', '/notebooks']) {
		await visit(page, where);
		const at = await page.evaluate(WHERE);
		expect(at.inTheWindow, `${where}: the mark is off the screen`).toBe(true);
		seen.push(at);
	}

	// The pages are genuinely different heights — otherwise this proves nothing.
	const heights = seen.map((s) => s.frame);
	expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(100);

	// And the mark did not move.
	expect(new Set(seen.map((s) => s.top)).size, `tops: ${heights.join()}`).toBe(1);
	expect(new Set(seen.map((s) => s.centre)).size).toBe(1);
});

test('and stays there when the navigation started halfway down a long page', async ({ page }) => {
	await register(page, `wait-deep-${Date.now()}@test.invalid`);
	await visit(page, '/settings/account');

	const atTop = await page.evaluate(WHERE);
	await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 900 }));
	await page.waitForTimeout(200);
	const scrolled = await page.evaluate(WHERE);

	expect(scrolled.inTheWindow, 'the mark scrolled off the screen').toBe(true);
	/*
	 * Within a few pixels, not to the pixel: the offset is a fraction of the
	 * window, and a window that gains or loses a few pixels of its own chrome
	 * as it scrolls moves it by that much. What is being asserted is that it
	 * did not travel with the page — nine hundred pixels of scroll, and it is
	 * where it was.
	 */
	expect(Math.abs(scrolled.top - atTop.top)).toBeLessThan(16);
});
