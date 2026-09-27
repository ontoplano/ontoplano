import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A room's heading wears the room's glyph, at every width.
 *
 * It used to on a phone only, so on a desktop "Tasks" and "Health" were the
 * same grey word and the glyph the menu teaches was nowhere near it.
 */
const ROOMS = ['/tasks/todo', '/notebooks', '/health/habits', '/goals'];

for (const [width, height] of [
	[1440, 900],
	[390, 844]
]) {
	test(`every room's heading carries its glyph (${width}px)`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width, height });
		await register(page, testEmail(`room-glyph-${width}`));

		for (const room of ROOMS) {
			await visit(page, room);
			const heading = page.getByRole('heading', { level: 1 }).first();
			const glyph = heading.locator('[data-room-glyph] svg');
			await expect(glyph, room).toBeVisible();

			// Beside the word, on its line — not above it.
			const [g, h] = await Promise.all([glyph.boundingBox(), heading.boundingBox()]);
			expect(g!.y, room).toBeGreaterThanOrEqual(h!.y - 1);
			expect(g!.y + g!.height, room).toBeLessThanOrEqual(h!.y + h!.height + 1);
		}
	});
}
