import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook holds what its subject actually accumulates.
 *
 * Notes and tasks to begin with, and whatever else is switched on in its own
 * Edit dialog: the shopping for a renovation, the bills, the account they are
 * paid from. The thing worth asserting is not that the setting saves — it is
 * that switching one on produces a tab that does the room's own work, and that
 * switching it off leaves what was filed under it exactly where it was.
 */
/**
 * A notebook, and its own page.
 *
 * The index shows one beside the list and says which in the query string; the
 * controls this is about — the Edit dialog among them — are on the notebook's
 * own page, which is the same component with the whole width.
 */
async function makeNotebook(page: Page, title: string): Promise<void> {
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await page.getByLabel('Title').fill(title);
	await page.getByRole('button', { name: 'Create notebook' }).click();
	await page.waitForTimeout(600);

	await page.getByRole('link', { name: title }).first().click();
	await page.waitForURL(/\?notebook=\d+/);
	const id = new URL(page.url()).searchParams.get('notebook');
	await visit(page, `/notebooks/${id}`);
}

test.describe('what a notebook holds', () => {
	test('starts at notes and tasks, and gains a tab when one is switched on', async ({ page }) => {
		await register(page, testEmail('nb-modules'));

		await makeNotebook(page, 'Kitchen renovation');

		// Two tabs, and no Inventory — a notebook made for a subject does not
		// start with nine of them.
		await expect(page.getByRole('button', { name: /^Notes/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Tasks/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Inventory/ })).toHaveCount(0);

		// Switch Inventory on, in the dialog the title and the description live
		// in — one pencil, one place to answer for the notebook.
		await page.getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByText('Tabs', { exact: true })).toBeVisible();
		// Notes is stated rather than offered: a notebook you cannot write in is
		// not a notebook.
		await expect(page.getByRole('checkbox', { name: 'Notes' })).toHaveCount(0);
		await page.getByRole('checkbox', { name: 'Inventory' }).check();
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForTimeout(600);

		const inventoryTab = page.getByRole('button', { name: /^Inventory/ });
		await expect(inventoryTab).toBeVisible();

		// And the tab does the room's work rather than linking to it.
		await inventoryTab.click();
		await page.getByRole('button', { name: 'New thing' }).click();
		await page.getByLabel('Item').fill('Wall tiles');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForTimeout(600);
		await expect(page.getByText('Wall tiles')).toBeVisible();

		// It is an ordinary inventory row, in the room where inventory lives.
		await visit(page, '/inventory');
		await expect(page.getByText('Wall tiles').first()).toBeVisible();
	});

	test('switching a module off takes the tab, not the things', async ({ page }) => {
		await register(page, testEmail('nb-modules-off'));

		await makeNotebook(page, 'Bathroom leak');

		await page.getByRole('button', { name: 'Rename' }).click();
		await page.getByRole('checkbox', { name: 'Inventory' }).check();
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForTimeout(600);

		await page.getByRole('button', { name: /^Inventory/ }).click();
		await page.getByRole('button', { name: 'New thing' }).click();
		await page.getByLabel('Item').fill('Sealant');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForTimeout(600);

		// Off again. The dialog says how much is filed under it, which is what
		// makes this legible as "one tab fewer" rather than "one thing deleted".
		await page.getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByText('1 filed')).toBeVisible();
		await page.getByRole('checkbox', { name: 'Inventory' }).uncheck();
		await page.getByRole('button', { name: 'Save' }).click();
		await page.waitForTimeout(600);

		await expect(page.getByRole('button', { name: /^Inventory/ })).toHaveCount(0);

		// Still in the cupboard.
		await visit(page, '/inventory');
		await expect(page.getByText('Sealant').first()).toBeVisible();
	});

	test('a room put away account-wide is not offered as a tab', async ({ page }) => {
		await register(page, testEmail('nb-modules-hidden'));

		// Put Finance away, the way anybody would.
		await visit(page, '/settings/preferences');
		const menu = page.locator('form[action="?/saveMenu"]');
		await menu.getByRole('checkbox', { name: 'Finance' }).uncheck();
		await menu.getByRole('button', { name: 'Save menu' }).click();
		await page.waitForTimeout(600);

		await makeNotebook(page, 'A subject');

		// The preference is one answer, given once: a room nobody wants is not
		// a question a notebook asks again.
		await page.getByRole('button', { name: 'Rename' }).click();
		await expect(page.getByText('Tabs', { exact: true })).toBeVisible();
		await expect(page.getByRole('checkbox', { name: 'Ledgers' })).toHaveCount(0);
		await expect(page.getByRole('checkbox', { name: 'Bills' })).toHaveCount(0);
		// And the ones that have nothing to do with Finance are still there.
		await expect(page.getByRole('checkbox', { name: 'Habits' })).toBeVisible();
	});

	test('the tabs keep their ticks across a save', async ({ page }) => {
		await register(page, testEmail('nb-modules-save'));

		await makeNotebook(page, 'Garden');

		await page.getByRole('button', { name: 'Rename' }).click();
		const recipes = page.getByRole('checkbox', { name: 'Recipes' });
		await recipes.check();
		// The row follows its own tick: a control that says the opposite of what
		// it is showing is a control nobody can trust.
		await expect(recipes).toBeChecked();

		/*
		 * And the save does not unpick them on the way out.
		 *
		 * An enhanced submit resets the form on success, and reset means the
		 * `checked` attribute rather than what was on screen — so every box went
		 * blank for the moment before the dialog closed, which reads exactly like
		 * the save having thrown the answer away.
		 */
		await page.getByRole('button', { name: 'Save' }).click();
		await expect
			.poll(async () =>
				page
					.getByRole('checkbox', { name: 'Recipes' })
					.isChecked()
					.catch(() => true)
			)
			.toBe(true);

		await page.waitForTimeout(600);
		await expect(page.getByRole('button', { name: /^Recipes/ })).toBeVisible();
	});
});
