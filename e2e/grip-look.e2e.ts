import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

test('the split handle looks like something you can take hold of', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, testEmail('grip'));
	await page.emulateMedia({ colorScheme: 'dark' });
	await visit(page, '/notebooks');

	const handle = page.locator('.split-handle');
	await expect(handle).toBeVisible({ timeout: 60_000 });
	await page.screenshot({ path: 'test-results/grip-dark.png' });

	// And the bar is actually painted, not a transparent pseudo-element. It was
	// a repeating radial gradient once, which drew three-pixel circles with a
	// hard stop — notches with corners on them at that size.
	const painted = await handle.evaluate((el) => {
		const after = getComputedStyle(el, '::after');
		return {
			color: after.backgroundColor,
			radius: after.borderTopLeftRadius,
			opacity: after.opacity,
			width: after.width
		};
	});
	expect(painted.color).not.toBe('rgba(0, 0, 0, 0)');
	expect(parseFloat(painted.radius)).toBeGreaterThan(0);
	expect(Number(painted.opacity)).toBeGreaterThan(0.5);

	// Concentric with the seam it sits on, so the two do not read as two lines.
	const places = await handle.evaluate((el) => {
		const box = el.getBoundingClientRect();
		const after = getComputedStyle(el, '::after');
		const before = getComputedStyle(el, '::before');
		return { strip: box.width, bar: parseFloat(after.width), seam: parseFloat(before.width) };
	});
	expect(places.seam).toBe(1);
	expect(places.bar).toBeGreaterThan(places.seam);
	expect(places.bar).toBeLessThanOrEqual(places.strip);
});
