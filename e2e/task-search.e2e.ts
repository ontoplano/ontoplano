import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Finding one task among many.
 *
 * The filters beside this answer "which kind" — finished, put away, in this
 * notebook, carrying that label. None of them answers "the one about the
 * plumber", which is what somebody with three hundred tasks is asking.
 */
test('the task list can be searched by what is written on it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('task-search'));
	await visit(page, '/tasks/todo');

	const make = async (title: string, notes = '') => {
		await page
			.getByRole('button', { name: /New task/ })
			.first()
			.click();
		const form = page.getByRole('dialog');
		await form.locator('[name="heading"]').first().fill(title);
		if (notes) await form.locator('textarea[name="notes"]').first().fill(notes);
		await form
			.getByRole('button', { name: /Create task/ })
			.last()
			.click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	};

	await make('ring the plumber', 'the boiler makes a noise');
	await make('book the skip');
	await make('choose tiles', 'something about a plumber in the notes');

	const box = page.getByPlaceholder('Search these tasks');
	await box.fill('plumber');

	// The title, and the one that only says it in its notes.
	await expect(page.getByText('ring the plumber')).toBeVisible();
	await expect(page.getByText('choose tiles')).toBeVisible();
	await expect(page.getByText('book the skip')).toHaveCount(0);

	// The count beside it says what is left.
	await expect(page.getByText(/2 tasks showing/)).toBeVisible();

	// Emptying it puts everything back.
	await box.fill('');
	await expect(page.getByText('book the skip')).toBeVisible();
});
