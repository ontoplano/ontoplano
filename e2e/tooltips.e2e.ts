import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

const SHOTS = '/tmp/claude-1000/-workspace/55780a3e-12df-496e-8516-01c0fd79f52a/scratchpad/shots';

/**
 * The app draws its own tooltips, everywhere, without anything being swept.
 *
 * Three hundred `title` attributes were being rendered by the browser, in a
 * system font with a system delay — the one part of the interface that never
 * looked like the rest, appearing at the moment somebody is unsure.
 */
test('a title becomes ours, and goes back when the pointer leaves', async ({ page }) => {
	await register(page, `tip-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const wheel = page.getByRole('button', { name: 'Jump to a section' });
	await expect(wheel).toHaveAttribute('title', /section/i);

	await wheel.hover();
	const tip = page.getByRole('tooltip');
	await expect(tip).toBeVisible({ timeout: 5000 });
	await expect(tip).toHaveText(/section/i);
	await page.screenshot({ path: `${SHOTS}/tip.png` });

	// The browser has nothing of its own to draw while ours is up…
	await expect(wheel).not.toHaveAttribute('title', /./);

	// …and the attribute is given back, because a title is also an accessible
	// name where there is no aria-label.
	await page.mouse.move(2, 2);
	await expect(tip).toHaveCount(0);
	await expect(wheel).toHaveAttribute('title', /section/i);
});

test('it stays on screen at the edges', async ({ page }) => {
	await register(page, `tip-edge-${Date.now()}@test.invalid`);
	await visit(page, '/');

	/*
	 * Whichever titled control sits nearest the right-hand edge, because that
	 * is the one whose label would hang off it.
	 *
	 * Chosen by measuring rather than by taking the last one in the markup:
	 * source order is not screen order, and a header that gains a control ought
	 * not to quietly change what this test is about.
	 */
	const titled = page.locator('header [title]:visible');
	const boxes = await titled.evaluateAll((els) =>
		els.map((el, i) => ({ i, right: el.getBoundingClientRect().right }))
	);
	const rightmost = boxes.sort((a, b) => b.right - a.right)[0];
	expect(rightmost, 'the header has nothing with a title on it').toBeTruthy();

	await titled.nth(rightmost.i).hover();
	const tip = page.getByRole('tooltip');
	// Generous: the tooltip waits before it appears, on purpose, and a loaded
	// machine is slow to give it the frame it is placed in.
	await expect(tip).toBeVisible({ timeout: 20_000 });

	const box = (await tip.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	// Below the bar rather than above the top of the window.
	expect(box.y).toBeGreaterThanOrEqual(0);
});

/**
 * An icon button keeps its name while its title is borrowed.
 *
 * On a button with no text and no `aria-label`, the `title` is the accessible
 * name — so taking it away to draw our own leaves the control nameless exactly
 * while somebody is pointing at it. It cost a suite failure before it cost
 * anybody their screen reader: a goal's "One more" button went missing from a
 * lookup by name, intermittently, for as long as the pointer was on it.
 */
test('a button named only by its title keeps that name while ours is up', async ({ page }) => {
	await register(page, `tip-name-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const wheel = page.getByRole('button', { name: 'Jump to a section' });
	await wheel.hover();
	await expect(page.getByRole('tooltip')).toBeVisible({ timeout: 20_000 });

	// Still findable by the same name, with the attribute borrowed.
	await expect(page.getByRole('button', { name: 'Jump to a section' })).toBeVisible();

	await page.mouse.move(2, 2);
	await expect(page.getByRole('tooltip')).toHaveCount(0);
	// The title back, and no borrowed label left on it. This control carries an
	// `aria-label` of its own, so none was lent — the marker is what says
	// whether one was, and it must never outlive the tooltip either way.
	await expect(wheel).toHaveAttribute('title', /section/i);
	await expect(wheel).not.toHaveAttribute('data-tip-named', /.*/);
});
