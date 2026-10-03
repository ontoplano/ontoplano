import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { png } from './helpers/png';
import { visit } from './helpers/visit';

/**
 * A picture pasted into writing is uploaded at once, and outlives the line
 * that showed it. The gallery lists the ones nothing points at, under a tile
 * of their own, and deletes them — one at a time or all together.
 */

/** Uploaded the way pasting does it, and then never mentioned anywhere. */
async function strayPicture(page: Page, colour: [number, number, number]) {
	const origin = new URL(page.url()).origin;
	const res = await page.request.post('/media', {
		headers: { Origin: origin },
		multipart: { file: png(colour) }
	});
	expect(res.ok(), `upload: ${res.status()}`).toBeTruthy();
}

for (const [width, height] of [
	[1400, 900],
	[390, 844]
]) {
	test(`unused pictures are found and deleted (${width}px)`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await register(page, testEmail(`unused-${width}`));
		await visit(page, '/media/gallery');
		// Nothing unused yet, so no tile.
		await expect(page.getByRole('link', { name: /^Unused/ })).toHaveCount(0);

		for (const colour of [
			[200, 10, 10],
			[10, 200, 10],
			[10, 10, 200]
		] as [number, number, number][])
			await strayPicture(page, colour);

		// With no album of its own, the account still reaches them.
		await visit(page, '/media/gallery');
		const tile = page.getByRole('link', { name: /^Unused/ });
		await expect(tile).toBeVisible();
		await tile.click();
		await page.waitForURL(/\/media\/gallery\/unused$/);
		await expect(page.locator('li img')).toHaveCount(3);
		await page.screenshot({ path: `test-results/unused-${width}.png` });

		// One, from the picture itself.
		await page.locator('li img').first().click();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		const confirm = page.getByRole('dialog', { name: 'Delete this picture?' });
		await confirm.getByRole('button', { name: 'Delete' }).click();
		await expect(page.locator('li img')).toHaveCount(2);

		// The rest, together.
		await page.getByRole('button', { name: 'Delete all' }).click();
		await page
			.getByRole('dialog', { name: 'Delete 2 unused pictures?' })
			.getByRole('button', { name: 'Delete' })
			.click();
		await expect(page.getByText('No unused pictures')).toBeVisible();

		await visit(page, '/media/gallery');
		await expect(page.getByRole('link', { name: /^Unused/ })).toHaveCount(0);
	});
}
