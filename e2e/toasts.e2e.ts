import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The app answering a press.
 *
 * Making a task used to change a list that had just reordered itself and say
 * nothing at all. The toast says it, and offers the move somebody actually
 * wants next: not Undo — you asked for the task and it is there — but a way
 * straight into it to say more.
 */
test('making a task says so, and offers a way into it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('toast-made'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill('Ring the plumber');
	await page.getByRole('button', { name: 'Create todo' }).click();

	const toast = page.locator('[role="status"]').filter({ hasText: 'Task added' });
	await expect(toast).toBeVisible({ timeout: 30_000 });

	// Edit, not Undo: the two say different things and this is the made case.
	await expect(toast.getByRole('button', { name: 'Edit' })).toBeVisible();
	await expect(toast.getByRole('button', { name: 'Undo' })).toHaveCount(0);

	await toast.getByRole('button', { name: 'Edit' }).click();

	// It opens the task just made, not an empty form.
	await expect(page.locator('[name="heading"]').first()).toHaveValue('Ring the plumber', {
		timeout: 30_000
	});
});

test('saving a change says so, with nothing to press', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('toast-saved'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill('Book the MOT');
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('Book the MOT').first()).toBeVisible({ timeout: 30_000 });

	// Edit it, and the toast for a change offers nothing — the change is on
	// screen behind it.
	await page.getByRole('button', { name: 'Edit' }).last().click();
	await page.locator('[name="heading"]').first().fill('Book the MOT properly');
	await page.getByRole('button', { name: 'Save' }).click();

	const toast = page.locator('[role="status"]').filter({ hasText: 'Saved' });
	await expect(toast).toBeVisible({ timeout: 30_000 });
	await expect(toast.getByRole('button')).toHaveCount(0);
});

test('deleting a task holds the request open, and the way back works', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('toast-deleted'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill('Cancel the gym');
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('Cancel the gym').first()).toBeVisible({ timeout: 30_000 });

	// Delete is armed by a first press and taken as meant by the second.
	await page.getByRole('button', { name: 'Delete' }).last().click();
	await page.getByRole('button', { name: 'Confirm' }).last().click();

	/*
	 * The toast first, and quickly: the window is five seconds and it is the
	 * thing under test. Asserting the empty list first spent the whole window
	 * polling, and by the time the toast was looked for the deletion had gone
	 * through — which is the test being slow, not the app being wrong.
	 */
	const toast = page.locator('[role="status"]').filter({ hasText: 'Cancel the gym' });
	await expect(toast).toBeVisible({ timeout: 10_000 });

	// The row is already gone — the toast is what is holding it now.
	await expect(page.getByRole('link', { name: 'Cancel the gym' })).toHaveCount(0);

	await toast.getByRole('button', { name: 'Undo' }).click();

	// And it comes back, because the request was never sent.
	await expect(page.getByText('Cancel the gym').first()).toBeVisible({ timeout: 30_000 });
});
