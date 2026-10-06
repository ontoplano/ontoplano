import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { png } from './helpers/png';
import { visit } from './helpers/visit';

/**
 * A notebook's picture is changed by dropping one on it.
 *
 * Choosing a file was the only way in, which meant finding the picture on the
 * desktop and then finding it again in a file chooser. The drop goes up the
 * same way the chooser's file does — see `PicturePicker`.
 */
test('a picture dropped on a notebook becomes its picture', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-picture-drop'));

	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: 'Climbing', folder: '' }
	});
	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: /Climbing/ })
		.first()
		.click();
	await page.waitForURL(/\?notebook=\d+/);
	const id = new URL(page.url()).searchParams.get('notebook');
	await visit(page, `/notebooks/${id}`);

	const square = page.getByRole('group', { name: 'A picture for Climbing' });
	await expect(square.locator('img')).toHaveCount(0);

	const { name, mimeType, buffer } = png([30, 140, 90]);
	const carried = await page.evaluateHandle(
		({ name, mimeType, bytes }) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }));
			return transfer;
		},
		{ name, mimeType, bytes: [...buffer] }
	);
	await square.dispatchEvent('dragover', { dataTransfer: carried });
	await square.dispatchEvent('drop', { dataTransfer: carried });

	await expect(page.getByRole('group', { name: 'Change the picture' }).locator('img')).toBeVisible({
		timeout: 15_000
	});
});
