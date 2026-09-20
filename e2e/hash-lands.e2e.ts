import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A link naming a part of a page lands on that part.
 *
 * Below `lg` the window does not scroll — `main` does — so the browser's own
 * fragment handling moved nothing and the assistant-activity notification
 * opened the integrations page at the top.
 */
test('a link with a fragment scrolls to it, inside the scroller', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('hash-lands'));

	await visit(page, '/settings/integrations#assistant-activity');

	const card = page.locator('#assistant-activity');
	await expect(card).toBeVisible({ timeout: 30_000 });
	// In view, not merely present: its top is on screen.
	const box = await card.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.y).toBeGreaterThan(0);
	expect(box!.y).toBeLessThan(844);
});
