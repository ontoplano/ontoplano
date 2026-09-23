import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Looking at a picture without leaving the page.
 *
 * Pressing one used to open a new tab — the browser's answer to a link, not
 * the app's answer to "let me see that".
 */
test('a picture opens over the page, and the ground closes it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('image-viewer'));
	await visit(page, '/notebooks/diary');

	// A note carrying a picture. The src need not resolve: the viewer is about
	// the press, not about the bytes.
	await page.getByRole('button', { name: 'New entry' }).first().click();
	const box = page.locator('textarea[name="content"]').first();
	await expect(box).toBeVisible({ timeout: 30_000 });
	await box.fill('a picture ![the wall](/media/1)');
	await page.getByRole('button', { name: 'Post entry' }).click();

	const picture = page.locator('img.md-image').first();
	await expect(picture).toBeVisible({ timeout: 30_000 });

	const tabsBefore = page.context().pages().length;
	await picture.click();

	const viewer = page.getByRole('dialog', { name: /the wall|Picture/ });
	await expect(viewer).toBeVisible();
	// Over the page, not in a second tab.
	expect(page.context().pages().length).toBe(tabsBefore);

	// Pressing the picture itself does not take it away.
	await viewer.locator('img').click();
	await expect(viewer).toBeVisible();

	// The ground does.
	await viewer.click({ position: { x: 5, y: 5 } });
	await expect(viewer).toHaveCount(0);
});
