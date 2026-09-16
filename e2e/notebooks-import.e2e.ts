import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The importer opens where you are, inside the thing it makes.
 *
 * "Import markdown" on Notebooks used to be a link to a settings page headed
 * "An Obsidian vault" — the right form under a name nobody was looking for, a
 * navigation away from the thing being worked on, and a page somebody arrived
 * at and reported as having no import form on it. Then it was a card of its
 * own halfway down this page, which is a second way of making a notebook
 * standing next to the first. It is the other answer to "new notebook" now,
 * folded into that dialogue.
 */
test('import markdown opens inside New notebook, not on a page of its own', async ({ page }) => {
	await register(page, testEmail('nb-import'));

	await visit(page, '/notebooks');
	const before = page.url();

	// Not a second button on the page competing with New notebook.
	await expect(page.getByRole('button', { name: 'Import markdown' })).toHaveCount(0);

	await page.getByRole('button', { name: 'New notebook' }).first().click();
	const dialogue = page.getByRole('dialog');
	await dialogue.getByText('…or import a folder of markdown').click();

	// The form itself, right here: a file input and the notebook to name.
	await expect(dialogue.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
	await expect(dialogue.locator('input[type="file"]')).toBeAttached();
	expect(page.url()).toBe(before);
});
