import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A key tied to one notebook, made on the page that makes keys.
 *
 * The mechanism is covered in `tests/mcp-confinement.test.ts`, which proves a
 * confined key cannot reach past its notebook. This is the other half: that
 * the choice is actually on the screen, that choosing it changes what the
 * permissions below are offering — a key tied to a notebook cannot touch the
 * shopping list, so a tickable shopping box would be a grant that grants
 * nothing — and that the key which comes out says what it is tied to.
 */
test('the key form offers to tie a key to one notebook', async ({ page }) => {
	await register(page, testEmail('confined-key'));

	// A notebook to tie it to. The choice is not offered to an account with
	// nothing to point at, which is the honest thing to do and also means this
	// has to make one first.
	await visit(page, '/notebooks');
	await page
		.getByRole('button', { name: /New notebook|Add notebook/ })
		.first()
		.click();
	await page.getByRole('textbox').first().fill('The flat');
	await page.keyboard.press('Enter');
	await expect(page.getByText('The flat').first()).toBeVisible();

	await visit(page, '/settings/integrations');
	await expect(async () => {
		await page.getByRole('button', { name: 'Create a key' }).click();
		await expect(page.getByRole('textbox', { name: 'What to call this key' })).toBeVisible({
			timeout: 2000
		});
	}).toPass({ timeout: 15000 });

	const reach = page.getByRole('combobox', { name: 'What it may work on' });
	await expect(reach).toBeVisible();

	/*
	 * Found by its accessible name, not by `name="scopes"`.
	 *
	 * A box that is out of reach loses those attributes deliberately — it must
	 * not post a grant it is not offering — so a selector on them would report
	 * "not found" where the interesting answer is "disabled".
	 */
	const shopping = page.getByRole('checkbox', { name: /Shopping list: write/ });
	const tasks = page.getByRole('checkbox', { name: /To-do list: write/ });
	await expect(shopping).toBeEnabled();

	await reach.selectOption('notebook');
	await expect(page.getByRole('combobox', { name: 'Which notebook' })).toBeVisible();

	/*
	 * The boxes that stopped meaning anything are disabled rather than gone.
	 *
	 * Removing them would make the table jump about as somebody changes their
	 * mind, and would hide the reason: it is the tie that put them out of
	 * reach, not the app deciding for them.
	 */
	await expect(shopping).toBeDisabled();
	await expect(tasks).toBeEnabled();

	// Named, because the field is required — an unnamed key is one you
	// cannot pick out of the list afterwards, which is the one moment the
	// list matters.
	await page
		.getByRole('textbox', { name: 'What to call this key' })
		.fill('a key tied to one notebook');

	await page.getByRole('button', { name: 'Create it' }).click();
	await expect(page.getByText(/^onto_/).first()).toBeVisible({ timeout: 10000 });

	// And the account says what it handed over, in the list of keys it has.
	await visit(page, '/settings/integrations/connections');
	await expect(page.getByText(/Tied to one notebook: The flat/).first()).toBeVisible();
});
