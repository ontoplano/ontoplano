import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The words this account already uses, offered before anything is typed.
 *
 * The list used to wait for a letter, which is the wrong way round: somebody
 * who knows their vocabulary wants to pick from it, and somebody who does not
 * cannot type the first letter of a word they have never seen.
 */
test('the tag box offers what is already there, and Tab walks it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('tag-completions'));
	await visit(page, '/tasks/todo');

	// A task with two labels, so the account has a vocabulary.
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('ring the plumber');
	await page.locator('#todo-form input[role="combobox"]').fill('house, urgent ');
	await form
		.getByRole('button', { name: /Create task/ })
		.last()
		.click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	// A second task: the box offers both words with nothing typed.
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const box = page.locator('#todo-form input[role="combobox"]');
	await box.click();
	const list = page.locator('#todo-form [role="listbox"]');
	await expect(list).toBeVisible();
	await expect(list.getByRole('option', { name: 'house' })).toBeVisible();
	await expect(list.getByRole('option', { name: 'urgent' })).toBeVisible();

	// Tab walks the list rather than leaving the field, and Enter takes the one
	// it is on.
	await box.press('Tab');
	await box.press('Enter');
	await expect(page.locator('#todo-form .chip')).toHaveCount(1);

	// And a word already taken is not offered twice.
	const taken = await page.locator('#todo-form .chip').first().innerText();
	await expect(list.getByRole('option', { name: taken.trim(), exact: true })).toHaveCount(0);
});
