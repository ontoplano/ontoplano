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

/**
 * Into a folder by carrying it there.
 *
 * The edit dialog's folder field was the only way to move a notebook, which
 * is a form for something the shelf can show: this notebook, that folder.
 * Dragged with a mouse — held and drawn across on a phone — and let go.
 */
test('a notebook dragged onto a folder goes into it', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('nb-folder-drag'));
	await visit(page, '/notebooks');
	const origin = new URL(page.url()).origin;
	for (const form of [
		{ heading: 'Kitchen', folder: 'Home' },
		{ heading: 'Garden', folder: '' }
	])
		await page.request.post('/notebooks?/create', {
			headers: { Origin: origin, 'x-sveltekit-action': 'true' },
			form
		});
	await visit(page, '/notebooks');

	const home = page.locator('.notebook-cover[data-drop-folder="Home"]');
	await expect(home).toContainText('1 notebook');

	const garden = page.locator('[data-tour="notebook-shelf"] a.cover-face', { hasText: 'Garden' });
	await garden.dragTo(home);

	await expect(home).toContainText('2 notebooks');
});
