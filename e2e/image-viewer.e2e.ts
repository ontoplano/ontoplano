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

test('a picture in a task’s notes opens in the viewer, zooms, and back closes it', async ({
	page
}) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('image-viewer-task'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.locator('[name="heading"]').first().fill('look at the wall');
	await page.locator('textarea[name="notes"]').fill('![the wall](/media/999999)');
	await page.getByRole('button', { name: 'Create task' }).click();

	const link = page.locator('a.written-picture').first();
	await expect(link).toBeVisible({ timeout: 30_000 });
	const tabsBefore = page.context().pages().length;
	await link.click();

	const viewer = page.getByRole('dialog');
	await expect(viewer).toBeVisible();
	expect(page.context().pages().length).toBe(tabsBefore);

	// A double tap goes in; the picture is drawn larger than it was.
	const picture = viewer.locator('img');
	await picture.dblclick();
	await expect
		.poll(async () => picture.evaluate((img) => getComputedStyle(img).transform))
		.not.toBe('none');

	// Back — the phone's gesture — takes it away and leaves the page where it was.
	await page.goBack();
	await expect(viewer).toHaveCount(0);
	await expect(page).toHaveURL(/\/tasks\/todo/);
});

test('a tall picture opens whole and centred on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('image-viewer-tall'));
	await visit(page, '/tasks/todo');

	// A phone screenshot's shape, drawn here so no upload is needed.
	await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 1080;
		canvas.height = 2000;
		canvas.getContext('2d')!.fillRect(0, 0, 1080, 2000);
		const img = document.createElement('img');
		img.className = 'md-image';
		img.id = 'tall';
		img.style.width = '120px';
		img.src = canvas.toDataURL();
		document.querySelector('main')!.prepend(img);
	});
	await page.locator('#tall').click();

	// Wait for the zoom library to have taken the picture over, then measure.
	const picture = page.locator('dialog.image-viewer img');
	await expect(picture).toBeVisible();
	await page.waitForTimeout(500);
	const box = (await picture.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(390);
	expect(box.y + box.height).toBeLessThanOrEqual(844);
	expect(Math.abs(box.y + box.height / 2 - 422)).toBeLessThan(2);
});

/**
 * A notebook's picture is a control — pressing it changes it — so looking at
 * it is the badge beside it. The square can be dragged bigger on a desktop.
 */
test('a notebook’s picture has a view badge, and a corner to drag', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('image-viewer-notebook'));
	await visit(page, '/notebooks');

	await page
		.getByRole('button', { name: /new notebook/i })
		.first()
		.click();
	await page.locator('[name="heading"]').first().fill('Kitchen');
	await page.getByRole('button', { name: 'Create notebook' }).click();
	// The notebook opens beside the shelf, picture control and all.
	await expect(page.getByRole('button', { name: 'New note', exact: true }).first()).toBeVisible({
		timeout: 30_000
	});

	// Its one picture: the notebook's own file input, not a note's `multiple` one.
	const { pngOfSize } = await import('./helpers/png');
	await page
		.locator('input[type="file"][name="file"]:not([multiple])')
		.first()
		.setInputFiles({ ...pngOfSize(24, 8), name: 'cover.png' });
	const badge = page.locator('button[data-view-src]').first();
	await expect(badge).toBeVisible({ timeout: 30_000 });
	await page.screenshot({ path: 'test-results/shots/notebook-picture-badge.png' });

	// Dragged bigger by its corner, on a desktop.
	const box = page.locator('.picture-box.resizable').first();
	await expect(box).toHaveCSS('resize', 'both');

	// The badge opens the viewer over the page; the picture itself still does not.
	await badge.click();
	const viewer = page.getByRole('dialog', { name: /View the picture|Picture/ });
	await expect(viewer).toBeVisible();
	await expect(viewer.locator('img')).toHaveAttribute('src', /\/media\/\d+/);
	await page.keyboard.press('Escape');
	await expect(viewer).toHaveCount(0);
});
