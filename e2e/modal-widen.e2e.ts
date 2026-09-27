import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A form dialog widens by its side edges, both at once, on a screen with room.
 *
 * Writing side by side in a 36rem dialog leaves each half a column wide; the
 * edges drag it wider, centred, and a double-click puts it back.
 */
test('dragging a side edge widens the dialog from both sides', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1400, height: 900 });
	await register(page, testEmail('modal-widen'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const dialog = page.locator('dialog[open]').first();
	await expect(dialog).toBeVisible();
	const before = (await dialog.boundingBox())!;

	const edge = dialog.locator('.widen-edge.right');
	const box = (await edge.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();

	const after = (await dialog.boundingBox())!;
	expect(after.width).toBeGreaterThan(before.width + 150);
	// Centred: the left edge went out as far as the right one did.
	expect(Math.abs(before.x - after.x - (after.width - before.width) / 2)).toBeLessThan(4);

	await edge.dblclick();
	await expect.poll(async () => (await dialog.boundingBox())!.width).toBeCloseTo(before.width, 0);
});
