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

	// And the dots are actually painted, not a transparent pseudo-element.
	const painted = await handle.evaluate((el) => {
		const after = getComputedStyle(el, '::after');
		return { image: after.backgroundImage, opacity: after.opacity, width: after.width };
	});
	expect(painted.image).toContain('radial-gradient');
	expect(Number(painted.opacity)).toBeGreaterThan(0.5);
});
