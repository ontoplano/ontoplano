import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A card's buttons work inside a notebook, and keep you there.
 *
 * The card is the Health room's, and its pencil, calendar and note button
 * used to send you into the room to open its dialogs. A task's or a note's
 * buttons open where they are, so a workout's and a thing's do too — see
 * `WorkoutDialogs` and `ItemDialog`.
 */
async function makeNotebook(page: Page, title: string, module = 'Workouts'): Promise<string> {
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
	await page.getByRole('checkbox', { name: module }).check();
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForTimeout(600);
	return id;
}

test("a workout's buttons on a notebook tab open its dialogs there", async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('nb-workout-buttons'));
	const id = await makeNotebook(page, 'Climbing');
	const here = new RegExp(`/notebooks/${id}`);

	await page.getByRole('button', { name: /^Workouts/ }).click();
	await page.getByRole('button', { name: 'New workout' }).click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').fill('Pull-up day');
	await form.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Pull-up day').first()).toBeVisible();

	// Edited where it is.
	await page.getByRole('button', { name: 'Edit Pull-up day' }).click();
	const editing = page.getByRole('dialog', { name: 'Edit workout' });
	await expect(editing).toBeVisible();
	await expect(editing.locator('[name="heading"]')).toHaveValue('Pull-up day');
	await editing.locator('[name="heading"]').fill('Pull-up night');
	await editing.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(editing).toBeHidden();
	await expect(page.getByText('Pull-up night').first()).toBeVisible();
	await expect(page).toHaveURL(here);

	await page.getByRole('button', { name: 'Plan Pull-up night onto a day' }).click();
	const day = page.getByRole('dialog', { name: 'Put it on a day' });
	await expect(day).toBeVisible();
	await day.getByRole('button', { name: 'Cancel' }).click();
	await expect(page).toHaveURL(here);

	// Written down here, and it shows on the card.
	await page.getByRole('button', { name: 'Write down what you did for Pull-up night' }).click();
	const log = page.getByRole('dialog', { name: /what did you do/i });
	await expect(log.locator('[name="doneOn"]')).toBeVisible();
	await log.locator('[name="notes"]').fill('felt strong');
	await log.getByRole('button', { name: 'Write it down' }).click();
	await expect(log).toBeHidden();
	await expect(page).toHaveURL(here);
});

test("a thing's pencil on a notebook's Inventory tab edits it there", async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('nb-item-pencil'));
	const id = await makeNotebook(page, 'Workshop', 'Inventory');

	await page.getByRole('button', { name: /^Inventory/ }).click();
	await page.getByRole('button', { name: 'New item' }).click();
	const form = page.getByRole('dialog', { name: 'New item' });
	await form.locator('[name="label"]').fill('Sandpaper');
	await form.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Sandpaper').first()).toBeVisible();

	await page.getByRole('button', { name: 'Edit Sandpaper' }).click();
	const editing = page.getByRole('dialog', { name: 'Edit item' });
	await expect(editing.locator('[name="label"]')).toHaveValue('Sandpaper');
	await editing.locator('[name="label"]').fill('Sandpaper, 120 grit');
	await editing.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(editing).toBeHidden();
	await expect(page.getByText('Sandpaper, 120 grit').first()).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/notebooks/${id}`));
});
