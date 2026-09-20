import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Typing tags.
 *
 * The server has always split on commas and spaces, so "work urgent" was two
 * tags the moment it was saved — the box was the only thing that did not know,
 * and it could not say which words the account already used.
 */
test('a space finishes a tag, and what is typed suggests what it could be', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-typing'));
	await visit(page, '/tasks/todo');

	// One task, to put two words into the vocabulary.
	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill('Ring the plumber');
	await page.locator('[name="tags"]').first().fill('household urgent');
	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('Ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	// A second task: the words typed into the first are offered back.
	await page.reload();
	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('[name="heading"]').first().fill('Book the MOT');

	const tags = page.locator('[name="tags"]').first();
	await tags.fill('hous');
	// Scoped to the suggestion list: the page also has a native "Filter by tag"
	// select, whose options answer to the same role and name.
	const suggestions = page.locator('[role="listbox"]');
	const option = suggestions.getByRole('option', { name: 'household' });
	await expect(option).toBeVisible({ timeout: 30_000 });
	await option.click();

	// Choosing one settles it as a chip and leaves the box ready for the next.
	await expect(tags).toHaveValue('household, ');

	// A space finishes a word typed by hand, without leaving the box.
	await tags.fill('household, urgent ');
	// Both are settled now, so both are drawn as chips beside the box.
	const chips = page.locator('.chip');
	await expect(chips.filter({ hasText: 'household' }).first()).toBeVisible();
	await expect(chips.filter({ hasText: 'urgent' }).first()).toBeVisible();

	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('Book the MOT').first()).toBeVisible({ timeout: 30_000 });
});
