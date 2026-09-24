import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * New, on a notebook's tab, opens the room's own form — here.
 *
 * It used to be a link out: pressing New bill inside a notebook took you to
 * Finance, and whatever you wrote there was filed back under the subject
 * afterwards. Two things are worth asserting. That the press keeps you in the
 * notebook and asks everything the room asks — a bill has to be able to say
 * when it falls due — and that the notebook is a question the form puts,
 * already answered with the one you are standing in.
 */
async function makeNotebook(page: Page, title: string, module: string): Promise<void> {
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await page.getByLabel('Title').fill(title);
	await page.getByRole('button', { name: 'Create notebook' }).click();
	await page.waitForTimeout(600);

	await page.getByRole('link', { name: title }).first().click();
	await page.waitForURL(/\?notebook=\d+/);
	const id = new URL(page.url()).searchParams.get('notebook');
	await visit(page, `/notebooks/${id}`);

	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByRole('checkbox', { name: module }).check();
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForTimeout(600);
}

test('a bill written on a notebook tab is written in the notebook', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('nb-module-forms'));

	await makeNotebook(page, 'Kitchen renovation', 'Bills');
	const at = page.url();

	await page.getByRole('button', { name: /^Bills/ }).click();
	await page.getByRole('button', { name: 'New bill' }).click();

	// The room's own form, not a thinner copy of it: the rhythm and the day it
	// falls due are most of what a bill is.
	const dialog = page.getByRole('dialog', { name: 'New bill' });
	await dialog.getByLabel('Name').fill('Skip hire');
	await expect(dialog.getByLabel('Rhythm')).toBeVisible();
	await expect(dialog.getByLabel('Due day of the month')).toBeVisible();

	// And the subject is a question the form asks, answered with this one.
	await expect(dialog.getByRole('button', { name: 'Notebook', exact: true })).toContainText(
		'Kitchen renovation'
	);

	await dialog.getByRole('button', { name: 'Save' }).click();
	await page.waitForTimeout(600);

	// Still in the notebook, with the bill on its tab.
	expect(page.url()).toBe(at);
	await expect(page.getByText('Skip hire').first()).toBeVisible();

	// And it is an ordinary bill, in the room where bills live.
	await visit(page, '/finance/bills');
	await expect(page.getByText('Skip hire').first()).toBeVisible();
});

test('the room asks which notebook, and files it there', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('nb-module-room-form'));

	await makeNotebook(page, 'Bathroom leak', 'Habits');

	// Written in the room, filed against the subject from there — the same
	// field, the other way round.
	await visit(page, '/health/habits');
	await page.getByRole('button', { name: 'New habit' }).first().click();
	const dialog = page.getByRole('dialog').first();
	await dialog.getByLabel('Name').fill('Check the trap');
	await dialog.getByRole('button', { name: 'Notebook', exact: true }).click();
	await page.getByRole('option', { name: 'Bathroom leak' }).click();
	await dialog.getByRole('button', { name: 'Create habit' }).click();
	await page.waitForTimeout(600);

	await visit(page, '/notebooks');
	await page.getByRole('link', { name: 'Bathroom leak' }).first().click();
	await page.waitForURL(/\?notebook=\d+/);
	const id = new URL(page.url()).searchParams.get('notebook');
	await visit(page, `/notebooks/${id}`);
	await page.getByRole('button', { name: /^Habits/ }).click();
	await expect(page.getByText('Check the trap').first()).toBeVisible();
});
