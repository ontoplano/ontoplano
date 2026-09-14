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

	// The last button in the header, whose label would hang off the right.
	const last = page.locator('header [title]').last();
	await last.hover();
	const tip = page.getByRole('tooltip');
	await expect(tip).toBeVisible({ timeout: 5000 });

	const box = (await tip.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	// Below the bar rather than above the top of the window.
	expect(box.y).toBeGreaterThanOrEqual(0);
});
