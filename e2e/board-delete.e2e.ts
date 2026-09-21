import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

test('the delete in the board editor deletes', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('board-delete'));

	await visit(page, '/tasks/todo');
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('bin this one');
	await form
		.getByRole('button', { name: /Create task|Create/ })
		.last()
		.click();
	await expect(page.getByText('bin this one').first()).toBeVisible({ timeout: 30_000 });

	// Onto today, so it is a column card rather than one in the side rail.
	await page
		.getByRole('button', { name: /Put it on today|today/i })
		.first()
		.click();
	await page.waitForTimeout(1500);

	await visit(page, '/tasks/board');
	await expect(page.getByText('bin this one').first()).toBeVisible({ timeout: 30_000 });

	/*
		The card is a button too, and its name used to swallow the labels of
		the buttons inside it — so "the edit control" matched the whole card
		first, and a press aimed at the icon opened the card instead. The card
		carries its own name now, and this asks for the icon by its exact one.
	*/
	const edit = page.getByRole('button', { name: 'Edit bin this one', exact: true });
	await expect(edit).toHaveCount(1);
	await edit.click();
	await page.waitForTimeout(1500);
	const editor = page.locator('dialog[open]').first();
	await expect(editor).toBeVisible({ timeout: 15_000 });
	// No pause: somebody who opens the editor to delete something presses it
	// straight away, and that press has to count.
	await editor.getByRole('button', { name: /Delete/ }).click();
	await page.waitForTimeout(2000);

	await expect(page.getByText('bin this one')).toHaveCount(0);
});
