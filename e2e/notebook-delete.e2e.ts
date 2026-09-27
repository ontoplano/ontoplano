import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Deleting a notebook starts from its Edit notebook dialogue — never from the
 * cover on the shelf — and is confirmed in a dialog of its own.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

async function deleteFromEditDialog(page: Page) {
	const edit = page.getByRole('dialog', { name: 'Edit notebook' });
	await edit.getByRole('button', { name: 'Delete', exact: true }).click();

	const confirm = page.getByRole('dialog', { name: 'Delete this notebook?' });
	await expect(confirm).toBeVisible();
	// `use:armed` ignores the press that opened it for a moment.
	await page.waitForTimeout(500);
	await confirm.getByRole('button', { name: 'Delete the notebook' }).click();
	await expect(page).toHaveURL(/\/notebooks$/);
}

for (const [label, size] of [
	['desktop', { width: 1280, height: 900 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`a notebook is deleted from its edit dialogue on the shelf (${label})`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize(size);
		await register(page, testEmail(`nb-delete-${label}`));
		await makeNotebook(page, 'Doomed');
		await makeNotebook(page, 'Kept');

		await visit(page, '/notebooks');
		const cover = page.locator('.notebook-cover', { hasText: 'Doomed' });
		await cover.hover();
		// The cover itself carries no delete.
		await expect(cover.getByRole('button', { name: /delete/i })).toHaveCount(0);

		await page.getByRole('button', { name: 'Edit Doomed', exact: true }).click();

		// Cancel leaves it alone.
		const edit = page.getByRole('dialog', { name: 'Edit notebook' });
		await edit.getByRole('button', { name: 'Delete', exact: true }).click();
		const confirm = page.getByRole('dialog', { name: 'Delete this notebook?' });
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		await expect(confirm).toBeHidden();
		// The form is still there underneath, on a phone as much as a desktop.
		await expect(edit).toBeVisible();

		await deleteFromEditDialog(page);
		await expect(page.locator('dialog[open]')).toHaveCount(0);
		await expect(page.locator('.notebook-cover', { hasText: 'Doomed' })).toHaveCount(0);
		await expect(page.locator('.notebook-cover', { hasText: 'Kept' })).toHaveCount(1);
	});
}

test('a notebook is deleted from its edit dialogue on its own page', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-delete-page'));
	await makeNotebook(page, 'Doomed');

	await visit(page, '/notebooks');
	await page.locator('.notebook-cover', { hasText: 'Doomed' }).getByRole('link').first().click();
	await page.getByRole('link', { name: 'Open' }).click();
	await expect(page).toHaveURL(/\/notebooks\/\d+$/);

	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	await deleteFromEditDialog(page);
	await expect(page.locator('.notebook-cover', { hasText: 'Doomed' })).toHaveCount(0);
});
