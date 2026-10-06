import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A workout card's buttons work inside a notebook.
 *
 * The card is the Health room's, but the notebook drew it without saying what
 * its pencil, its calendar or its note button should do, so all three were
 * dead. They open the room's own dialogs, by address.
 */
async function makeNotebook(page: Page, title: string): Promise<string> {
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await page.getByLabel('Title').fill(title);
	await page.getByRole('button', { name: 'Create notebook' }).click();
	await page.waitForTimeout(600);

	await page.getByRole('link', { name: title }).first().click();
	await page.waitForURL(/\?notebook=\d+/);
	const id = new URL(page.url()).searchParams.get('notebook')!;
	await visit(page, `/notebooks/${id}`);

	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByRole('checkbox', { name: 'Workouts' }).check();
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForTimeout(600);
	return id;
}

test("a workout's buttons on a notebook tab open the room's dialogs", async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('nb-workout-buttons'));
	const id = await makeNotebook(page, 'Climbing');

	await page.getByRole('button', { name: /^Workouts/ }).click();
	await page.getByRole('button', { name: 'New workout' }).click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').fill('Pull-up day');
	await form.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Pull-up day').first()).toBeVisible();

	const back = async () => {
		await visit(page, `/notebooks/${id}`);
		await page.getByRole('button', { name: /^Workouts/ }).click();
	};

	await page.getByRole('button', { name: 'Edit Pull-up day' }).click();
	await expect(page.getByRole('dialog', { name: 'Edit workout' })).toBeVisible();
	await expect(page.getByRole('dialog').locator('[name="heading"]')).toHaveValue('Pull-up day');

	await back();
	await page.getByRole('button', { name: 'Plan Pull-up day onto a day' }).click();
	await expect(page.getByRole('dialog', { name: 'Put it on a day' })).toBeVisible();

	await back();
	await page.getByRole('button', { name: 'Write down what you did for Pull-up day' }).click();
	await expect(page.getByRole('dialog').locator('[name="doneOn"]')).toBeVisible();
});
