import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Saying when, while writing it.
 *
 * A task with no day sits in the general list; giving it one puts it on that
 * day. The form could not say when, so "ring the plumber tomorrow" became a
 * task with the word tomorrow in its title and a day that still looked empty.
 */
test('a task can be given a day as it is written', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('task-day'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('[name="heading"]').first().fill('Ring the plumber');

	const more = page.getByRole('button', { name: /Category, notebook/ }).first();
	if (await more.count()) await more.click();

	const day = page.locator('#todo-form [name="scheduledDate"]');
	await expect(day).toBeVisible({ timeout: 30_000 });
	await day.fill('2026-10-02');
	await page.getByRole('button', { name: 'Create task' }).click();

	// It carries the day, and the edit form comes back with it rather than blank.
	await expect(page.getByText('Ring the plumber').first()).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
	const more2 = page.getByRole('button', { name: /Category, notebook/ }).first();
	if (await more2.count()) await more2.click();
	await expect(page.locator('#todo-form [name="scheduledDate"]')).toHaveValue('2026-10-02');
});
