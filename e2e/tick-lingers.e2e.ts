import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A ticked task is seen to be ticked before it goes.
 *
 * "this should show it checked and greyed (just like a completed card
 * appears) just before it disappears, for like 0.5s". Without the pause the
 * answer to a press was a row that simply vanished, which reads as something
 * deleted rather than something done.
 */
test('a task stays on screen, ticked and greyed, for a moment after it is done', async ({
	page
}) => {
	test.setTimeout(180_000);
	await register(page, testEmail('tick-lingers'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill('take the bins out');
	await page.getByRole('button', { name: 'Create task' }).click();

	const row = page.locator('div', { hasText: 'take the bins out' }).last();
	await expect(page.getByText('take the bins out').first()).toBeVisible({ timeout: 30_000 });

	await page
		.getByRole('button', { name: /Mark complete/ })
		.first()
		.click();

	// Still there, and drawn as finished.
	const greyed = page.locator('.opacity-50', { hasText: 'take the bins out' }).first();
	await expect(greyed).toBeVisible({ timeout: 2000 });

	// And then out of the list, because it is not showing finished ones. The
	// toast still names it, which is the way back — so this asks the list.
	await expect(
		page.locator('[data-tour] .items-stretch', { hasText: 'take the bins out' })
	).toHaveCount(0, { timeout: 15_000 });
	void row;
});
