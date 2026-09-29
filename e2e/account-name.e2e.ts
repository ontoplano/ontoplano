import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The name the app calls you by is changed from Account, and the header says
 * the new one straight away — at a desk and on a phone.
 */
for (const [label, viewport] of [
	['desktop', { width: 1280, height: 800 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`a person renames themselves from Account (${label})`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize(viewport);
		await register(page, testEmail(`account-name-${label}`));
		await visit(page, '/settings/account');

		await page.getByRole('button', { name: 'Change', exact: true }).first().click();
		const dialog = page.getByRole('dialog', { name: 'Change your name' });
		const field = dialog.locator('[name="name"]');
		await expect(field).toBeFocused();

		// A blank name is refused and the dialog stays.
		await field.fill('   ');
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(dialog.getByText('A name cannot be empty')).toBeVisible({ timeout: 30_000 });

		await field.fill('Ana Maria');
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(dialog).toBeHidden({ timeout: 30_000 });
		await expect(
			page.getByText('Ana Maria', { exact: true }).filter({ visible: true }).first()
		).toBeVisible();

		await page.reload();
		await expect(
			page.getByText('Ana Maria', { exact: true }).filter({ visible: true }).first()
		).toBeVisible();
	});
}
