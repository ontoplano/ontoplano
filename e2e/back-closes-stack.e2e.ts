import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A dialog opened from inside another, on a phone.
 *
 * Each screen there holds a history entry so the back gesture closes it. With
 * one entry shared between them, opening the delete confirmation over the
 * Edit notebook form closed the form underneath, and Cancel landed on the
 * shelf. They stack now: back and Cancel close the top one only.
 */
const PHONE = { width: 390, height: 844 };

async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

/** The browser's own back, which on Android is the system gesture. */
async function back(page: Page) {
	await page.evaluate(() => history.back());
}

test('the delete confirmation stacks over the Edit notebook form (phone)', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize(PHONE);
	await register(page, testEmail('back-stack-delete'));
	await makeNotebook(page, 'Doomed');
	await makeNotebook(page, 'Kept');
	await visit(page, '/notebooks');

	await page.locator('.notebook-cover', { hasText: 'Doomed' }).hover();
	await page.getByRole('button', { name: 'Edit Doomed', exact: true }).click();
	const edit = page.getByRole('dialog', { name: 'Edit notebook' });
	const confirm = page.getByRole('dialog', { name: 'Delete this notebook?' });
	await expect(edit).toBeVisible();

	// Cancel returns to the form, not to the shelf.
	await edit.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirm).toBeHidden();
	await expect(edit).toBeVisible();

	// Back closes the confirmation and leaves the form…
	await edit.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(confirm).toBeVisible();
	await back(page);
	await expect(confirm).toBeHidden();
	await expect(edit).toBeVisible();

	// …and back again closes the form, staying on the shelf.
	await back(page);
	await expect(edit).toBeHidden();
	await expect(page).toHaveURL(/\/notebooks$/);

	// A delete still lands on the shelf, with nothing left open.
	await page.locator('.notebook-cover', { hasText: 'Doomed' }).hover();
	await page.getByRole('button', { name: 'Edit Doomed', exact: true }).click();
	await edit.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(confirm).toBeVisible();
	await page.waitForTimeout(500); // `use:armed`
	await confirm.getByRole('button', { name: 'Delete the notebook' }).click();
	await expect(page).toHaveURL(/\/notebooks$/);
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page.locator('.notebook-cover', { hasText: 'Doomed' })).toHaveCount(0);
	await expect(page.locator('.notebook-cover', { hasText: 'Kept' })).toHaveCount(1);

	// And both entries went with the dialogs: nothing is left holding one.
	const held = await page.evaluate(
		() => (history.state?.['sveltekit:states'] as { backCloses?: number[] } | undefined)?.backCloses
	);
	expect(held ?? []).toEqual([]);
});

/*
 * Any history pop cancels the navigation SvelteKit has in flight — on a
 * slow machine the Edit dialogue's entry came back while the shelf was
 * reloading after the delete, the fresh data was thrown away, and the
 * deleted notebook stayed on the shelf. Forced here: a pop lands mid-load.
 */
test('a pop landing while the shelf reloads does not undo the delete (phone)', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize(PHONE);
	await register(page, testEmail('back-stack-late-pop'));
	await makeNotebook(page, 'Doomed');
	await makeNotebook(page, 'Kept');
	await visit(page, '/notebooks');

	await page.route(
		(url) => url.pathname === '/notebooks/__data.json',
		async (route) => {
			await page.evaluate(() => {
				history.pushState(history.state, '');
				history.back();
			});
			await new Promise((done) => setTimeout(done, 300));
			await route.continue();
		},
		{ times: 1 }
	);

	await page.locator('.notebook-cover', { hasText: 'Doomed' }).hover();
	await page.getByRole('button', { name: 'Edit Doomed', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Edit notebook' })
		.getByRole('button', { name: 'Delete', exact: true })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete this notebook?' });
	await expect(confirm).toBeVisible();
	await page.waitForTimeout(500); // `use:armed`
	await confirm.getByRole('button', { name: 'Delete the notebook' }).click();
	await expect(page.locator('.notebook-cover', { hasText: 'Doomed' })).toHaveCount(0);
	await expect(page.locator('.notebook-cover', { hasText: 'Kept' })).toHaveCount(1);
});

test('the task picker stacks over a maximized notebook (phone)', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize(PHONE);
	await register(page, testEmail('back-stack-picker'));
	await makeNotebook(page, 'Kitchen');
	await visit(page, '/notebooks');
	// A phone opens a notebook on its own page rather than beside the shelf.
	await page.getByRole('link', { name: /^Kitchen/ }).click();
	await page.waitForURL(/\/notebooks\/\d+/);

	await page.getByRole('button', { name: /^Tasks \d/ }).click();
	await page.getByRole('button', { name: 'New task', exact: true }).click();
	await page.locator('#todo-form [name="heading"]').fill('measure the wall');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('measure the wall').first()).toBeVisible();

	await page.getByRole('button', { name: /^Notes \d/ }).click();
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.getByRole('button', { name: 'The whole screen' }).click();
	const surface = page.locator('dialog.nb-surface[open]');
	await expect(surface).toBeVisible();

	const box = surface.locator('form[action="?/addEntry"] textarea[name="content"]');
	await box.click();
	await page.keyboard.type('see TASK:#');
	const picker = page.getByRole('dialog', { name: 'Point at a task' });
	await expect(picker).toBeVisible();
	await expect(surface).toBeVisible();

	// Back closes the picker; the notebook stays whole-screen, the draft intact.
	await back(page);
	await expect(picker).toBeHidden();
	await expect(surface).toBeVisible();
	await expect(box).toHaveValue('see TASK:#');

	// Picking by its own controls closes only the picker too.
	await box.click();
	await page.keyboard.type(' and TASK:#');
	await expect(picker).toBeVisible();
	await page.keyboard.type('wall');
	await page.keyboard.press('Enter');
	await expect(picker).toBeHidden();
	await expect(surface).toBeVisible();
	await expect(box).toHaveValue('see TASK:# and TASK:#1');

	// Back again leaves the whole screen.
	await back(page);
	await expect(page.locator('dialog.nb-surface[open]')).toHaveCount(0);
});
