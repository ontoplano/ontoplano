import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { png } from './helpers/png';
import { visit } from './helpers/visit';

/**
 * A thing in the inventory can wear a picture, set from its own dialog — and
 * the things without one are not filled with placeholders asking for one: the
 * list keeps a picture's room on every row, empty, so the names stay in one
 * column.
 */
async function addItem(page: Page, name: string) {
	await page
		.getByRole('button', { name: /Add item/ })
		.first()
		.click();
	const d = page.getByRole('dialog', { name: 'New item' });
	await d.locator('[name="label"]').fill(name);
	await d.getByRole('button', { name: 'Add item', exact: true }).click();
	await expect(page.locator('.row-card').filter({ hasText: name })).toBeVisible();
}

for (const [label, size] of [
	['desktop', { width: 1280, height: 900 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`a thing gets a picture, and the names stay in line (${label})`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize(size);
		await register(page, testEmail(`inv-pic-${label}`));
		await visit(page, '/inventory/stock');
		await addItem(page, 'drill');
		await addItem(page, 'tape');

		const drill = page.locator('.row-card').filter({ hasText: 'drill' });
		const tape = page.locator('.row-card').filter({ hasText: 'tape' });
		// No picture anywhere: no room kept for one either.
		await expect(page.locator('.row-card-thumb')).toHaveCount(0);

		await drill.getByRole('button', { name: /^Edit/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Edit item' });
		await dialog.locator('input[type="file"]').setInputFiles(png([200, 120, 40]));
		await expect(drill.locator('img')).toBeVisible({ timeout: 15_000 });

		// The picture-less one keeps the room, empty — no placeholder in it.
		await expect(tape.locator('.row-card-thumb')).toHaveCount(1);
		await expect(tape.locator('.row-card-thumb img')).toHaveCount(0);
		const x = async (row: typeof drill) =>
			(await row.getByText(row === drill ? 'drill' : 'tape', { exact: true }).boundingBox())!.x;
		expect(Math.abs((await x(drill)) - (await x(tape)))).toBeLessThan(1);

		// And off again, from the same dialog.
		await dialog.getByRole('button', { name: 'Remove the picture' }).click();
		await expect(drill.locator('img')).toHaveCount(0, { timeout: 15_000 });
	});
}
