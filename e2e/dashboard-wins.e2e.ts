import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

test('the Diary shortcut saves all three wins on the dashboard', async ({ page }) => {
	await register(page, testEmail('dashboard-wins'));
	const origin = new URL(page.url()).origin;
	const layout = new URLSearchParams([
		['card', 'diary'],
		['card', 'threeWins']
	]);
	const response = await page.request.post('/?/setLayout', {
		headers: {
			Origin: origin,
			'content-type': 'application/x-www-form-urlencoded',
			'x-sveltekit-action': 'true'
		},
		data: layout.toString()
	});
	expect(response.ok()).toBe(true);
	await visit(page, '/');

	await page.getByRole('button', { name: '3 Wins' }).click();
	const dialog = page.getByRole('dialog', { name: '3 Wins' });
	for (const [position, content] of ['First win', 'Second win', 'Third win'].entries()) {
		await dialog.locator(`[name="win_${position + 1}"]`).fill(content);
	}
	await dialog.getByRole('button', { name: 'Save wins' }).click();
	await expect(dialog).not.toBeVisible();
	for (const [position, content] of ['First win', 'Second win', 'Third win'].entries()) {
		await expect(page.locator(`[data-card="threeWins"] [name="win_${position + 1}"]`)).toHaveValue(
			content
		);
	}
});
