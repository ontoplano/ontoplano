import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The importer opens where you are.
 *
 * "Import markdown" on Notebooks used to be a link to a settings page headed
 * "An Obsidian vault" — the right form under a name nobody was looking for, a
 * navigation away from the thing being worked on, and a page somebody arrived
 * at and reported as having no import form on it. Same form, opened in place.
 */
test('import markdown opens on the notebooks page, not another one', async ({ page }) => {
	await register(page, `nb-import-${Date.now()}@test.invalid`);

	await visit(page, '/notebooks');
	const before = page.url();

	await page.getByRole('button', { name: 'Import markdown' }).click();

	// The form itself, on this page: a file input and the notebook to name.
	await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
	await expect(page.locator('input[type="file"]')).toBeAttached();
	expect(page.url()).toBe(before);
});
