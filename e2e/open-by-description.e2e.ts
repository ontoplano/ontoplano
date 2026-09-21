import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The line under the title opens the task too.
 *
 * The title was the only thing that unfolded one, and the words under it —
 * the line you are reading when you want the rest — did nothing.
 */
test('pressing a task’s description unfolds it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('open-by-description'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New to-do/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('ring the plumber');
	await form
		.locator('textarea[name="notes"]')
		.first()
		.fill('the boiler makes a noise after nine, and his number is on the fridge');
	await form
		.getByRole('button', { name: /Create todo/ })
		.last()
		.click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	const title = page.getByRole('button', { name: 'ring the plumber' });
	await expect(title).toHaveAttribute('aria-expanded', 'false');

	await page
		.getByText(/the boiler makes a noise/)
		.first()
		.click();
	await expect(title).toHaveAttribute('aria-expanded', 'true');

	// And it folds again, so the press is the same gesture either way.
	await page
		.getByText(/the boiler makes a noise/)
		.first()
		.click();
	await expect(title).toHaveAttribute('aria-expanded', 'false');
});
