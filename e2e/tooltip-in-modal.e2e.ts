import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The app's own tooltip is drawn in the top layer.
 *
 * A `<dialog>` is drawn there too, and no `z-index` reaches over it — so
 * inside any modal the bubble was behind the thing it described, and what
 * turned up instead was the browser's own beige box, late and in a system
 * font. As a popover it shares the layer with the dialog and can sit on it.
 */
test('the tooltip is a popover, so a dialog cannot cover it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('tooltip-layer'));
	await visit(page, '/tasks/todo');
	await page.waitForTimeout(800);

	await page.locator('[title]').first().hover();
	await page.waitForTimeout(900);

	const tip = page.locator('[role="tooltip"]');
	await expect(tip).toBeVisible();
	// `:popover-open` matches only while it is in the top layer.
	expect(await tip.evaluate((el) => el.matches(':popover-open'))).toBe(true);
});
