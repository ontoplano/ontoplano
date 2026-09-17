import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The plus opens two wheels, and they are independent.
 *
 * One wheel asked what to write down. There are two questions now — what to
 * add, and what to write — and they are separate wheels because they are
 * separate decisions. The arithmetic that sizes them is the interesting part:
 * two rings, a gap either side and one between, filling the width without
 * touching, at whatever width the screen happens to be.
 */
async function openWheels(page: import('@playwright/test').Page) {
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

test('opens two wheels that fill the width and never overlap', async ({ page }) => {
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheels'));
	await visit(page, '/');
	await openWheels(page);

	const rings = page.locator('.pie-layer .pie');
	await expect(rings).toHaveCount(2);

	const left = await rings.nth(0).boundingBox();
	const right = await rings.nth(1).boundingBox();
	if (!left || !right) throw new Error('a wheel was not drawn');

	/*
	 * One backdrop between them, not one each.
	 *
	 * Each wheel used to draw its own `fixed inset-0` layer with a full-screen
	 * button in it. Two of those dims the page twice and puts the wheel
	 * underneath behind a button covering the whole screen.
	 */
	await expect(page.locator('.pie-layer button[aria-label="Close"]')).toHaveCount(1);

	// Round, and the same size as each other.
	for (const box of [left, right]) expect(Math.abs(box.width - box.height)).toBeLessThan(2);
	expect(Math.abs(left.width - right.width)).toBeLessThan(2);

	// Side by side with a gap, not overlapping.
	const [first, second] = left.x <= right.x ? [left, right] : [right, left];
	expect(first.x + first.width).toBeLessThanOrEqual(second.x + 1);

	// And practically all of the width: everything outside them is padding.
	const spare = 412 - (first.width + second.width);
	expect(spare).toBeGreaterThan(0);
	expect(spare).toBeLessThan(412 * 0.35);

	await page.mouse.up();
});

test('the left wheel offers a picture and a recording', async ({ page }) => {
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheels-media'));
	await visit(page, '/');
	await openWheels(page);

	/*
	 * By key rather than by label: a wedge is an icon and a colour at this
	 * size — its name is spoken in the middle of the wheel when the pointer
	 * reaches it, and read by anything listening. `data-wedge` is what it is.
	 */
	await expect(page.locator('[data-wedge="picture"]')).toHaveCount(1);
	await expect(page.locator('[data-wedge="recording"]')).toHaveCount(1);
	// And the writing wheel is still the writing wheel.
	await expect(page.locator('[data-wedge="idea"]')).toHaveCount(1);
	await expect(page.locator('[data-wedge="todo"]')).toHaveCount(1);

	await page.mouse.up();
});

test('the left wheel can actually be pressed', async ({ page }) => {
	/*
	 * The bug this exists for: each wheel drew a full-screen layer with a
	 * backdrop button in it, so the second one stacked over the first and the
	 * wheel underneath was visible and inert. Being *drawn* is not the test.
	 */
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('wheels-press'));
	await visit(page, '/');
	await openWheels(page);
	await page.mouse.up();

	await page.locator('[data-wedge="recording"]').click();

	// The recorder, in a dialog, ready to be talked at.
	await expect(page.getByRole('dialog')).toContainText('New recording');
	await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
});
