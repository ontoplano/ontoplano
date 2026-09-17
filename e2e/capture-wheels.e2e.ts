import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

test.use({
	launchOptions: {
		args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
	},
	permissions: ['microphone']
});

/**
 * The plus opens one wheel, and two of its wedges are not words.
 *
 * It was two wheels for a while — what to add on the left, what to write on
 * the right. One gesture asking two questions is one question too many, so
 * they are one wheel of six, and the work the second wheel was doing is done
 * by drawing the pair harder than the four beside them.
 */
async function openWheel(page: import('@playwright/test').Page) {
	const all = page.locator('[data-tour="capture"]');
	let box = null;
	for (let i = 0; i < (await all.count()); i++) {
		const one = await all.nth(i).boundingBox();
		if (one) box = one;
	}
	if (!box) throw new Error('no capture trigger on this screen');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(600);
	return box;
}

test('is one wheel, holding what you write and what you add', async ({ page }) => {
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheel-six'));
	await visit(page, '/');
	await openWheel(page);

	// One ring and one backdrop, whatever is in it.
	await expect(page.locator('.pie-layer .pie')).toHaveCount(1);
	await expect(page.locator('.pie-layer button[aria-label="Close"]')).toHaveCount(1);

	// The four you write, and the two you add.
	for (const key of ['idea', 'todo', 'picture', 'recording']) {
		await expect(page.locator(`[data-wedge="${key}"]`)).toHaveCount(1);
	}

	await page.mouse.up();
});

test('draws the two media wedges harder than the rest', async ({ page }) => {
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheel-emphasis'));
	await visit(page, '/');
	await openWheel(page);

	/*
	 * Six wedges is enough that the eye has to find the pair without reading
	 * every icon, and that is the whole reason the second wheel could go.
	 */
	const fill = async (key: string) =>
		Number(await page.locator(`[data-wedge="${key}"] path`).first().getAttribute('fill-opacity'));

	const media = await fill('picture');
	const writing = await fill('idea');
	expect(media).toBeGreaterThan(writing);

	await page.mouse.up();
});

test('sits clear of the bar it is raised from', async ({ page }) => {
	/*
	 * The wheel is pushed up by the height of the navigation bar, read from
	 * `--mobile-nav-height` — which is written in `rem`, and `parseFloat` of
	 * `3.5rem` is three and a half. The wheel sat fifty pixels too low for
	 * months, with its bottom wedge half behind the bar.
	 */
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheel-clear'));
	await visit(page, '/');
	await openWheel(page);

	const ring = await page.locator('.pie-layer .pie').boundingBox();
	const bar = await page.locator('[data-tour="capture"]').last().boundingBox();
	if (!ring || !bar) throw new Error('nothing to measure');

	expect(ring.y + ring.height).toBeLessThanOrEqual(bar.y + 1);

	await page.mouse.up();
});

test('the recording wedge records, with no second press', async ({ page }) => {
	/*
	 * It used to open a dialog with a Record button in it — a screen you
	 * reached by pressing Record, asking you to press Record. The wedge is the
	 * answer; what appears is the thing already running.
	 */
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheel-records'));
	await visit(page, '/');
	await openWheel(page);
	await page.mouse.up();

	await page.locator('[data-wedge="recording"]').click();

	// Recording, in a strip rather than a dialog, with no Record button left.
	await expect(page.locator('.recorder-stage')).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Record', exact: true })).toHaveCount(0);
});
