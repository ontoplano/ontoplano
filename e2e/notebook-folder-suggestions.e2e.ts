import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The folder field offers the shelf's folders as soon as it is entered.
 *
 * It was a `<datalist>`, which several browsers keep hidden until a letter is
 * typed — so the folders already in use were never seen, and a second
 * spelling of one was the likely result. A new folder can still be typed.
 */
test('the folder field offers the folders the shelf has, and takes a new one', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('nb-folder-suggest'));
	await visit(page, '/notebooks');
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: 'Kitchen', folder: 'Home' }
	});
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: 'New notebook' }).first().click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Title').fill('Bathroom');
	const folder = dialog.getByRole('combobox', { name: 'Folder' });

	// Entered, not typed at: the list is already there.
	await folder.click();
	await expect(dialog.getByRole('option', { name: 'Home' })).toBeVisible();

	// A name nobody has used is a new folder, and no list stands in the way.
	await folder.fill('Garden');
	await expect(dialog.getByRole('listbox')).toHaveCount(0);

	// And back to one the shelf has.
	await folder.fill('Ho');
	await dialog.getByRole('option', { name: 'Home' }).click();
	await expect(folder).toHaveValue('Home');
	await dialog.getByRole('button', { name: 'Create notebook' }).click();

	await expect(page.getByRole('link', { name: 'Bathroom' }).first()).toBeVisible();
	await expect(page.getByText('Home').first()).toBeVisible();
});
