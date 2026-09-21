import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A slip does not cost somebody what they typed.
 *
 * "some times i am writing a task and accidentally press esc and lose all shit
 * i've typed: come on, it just shouldn't reset the form."
 *
 * Escape and the backdrop are accidents; Cancel and a save that worked are
 * somebody saying they are finished. The two have to behave differently, and
 * both are checked here.
 */
test('Escape keeps the half-written task, Cancel throws it away', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('kept-form'));
	await visit(page, '/tasks/todo');

	const open = async () => {
		await page
			.getByRole('button', { name: /New task/ })
			.first()
			.click();
		const form = page.getByRole('dialog');
		await expect(form.locator('#todo-form')).toBeVisible({ timeout: 15_000 });
		return form;
	};

	let form = await open();
	await form.locator('[name="heading"]').first().fill('ring the plumber about the boiler');
	await form.locator('[name="notes"]').first().fill('the one behind the panel');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

	// Both fields come back, not just the title.
	form = await open();
	await expect(form.locator('[name="heading"]').first()).toHaveValue(
		'ring the plumber about the boiler'
	);
	await expect(form.locator('[name="notes"]').first()).toHaveValue('the one behind the panel');

	// Cancel is the other kind of leaving.
	await form.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });

	form = await open();
	await expect(form.locator('[name="heading"]').first()).toHaveValue('');
	await expect(form.locator('[name="notes"]').first()).toHaveValue('');
});

test('a task that was saved leaves no draft behind', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('kept-form-saved'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('buy the brackets');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('buy the brackets').first()).toBeVisible({ timeout: 30_000 });

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await expect(page.getByRole('dialog').locator('[name="heading"]').first()).toHaveValue('');
});
