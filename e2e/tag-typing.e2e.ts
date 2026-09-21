import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Typing tags.
 *
 * The chips are the tags; the input is the word being typed. They were one
 * string once, and both things wrong with it came from that: the input never
 * cleared, because clearing it would have deleted the chips, and nothing was
 * ever suggested, because the "word being typed" was whatever trailed the last
 * separator — nothing, right after a space.
 */
test('a space makes a chip and empties the box, and typing suggests', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-typing'));
	await visit(page, '/tasks/todo');

	// Scoped to the form: the page also has a row of tag-filter chips that
	// answer to the same class.
	const form = () => page.getByLabel('New task');
	const tags = () => form().locator('input[role="combobox"]').first();
	const chips = () => form().locator('.chip');

	// One task, to put two words into the vocabulary.
	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('[name="heading"]').first().fill('Ring the plumber');
	await tags().fill('household');
	await tags().press(' ');

	// The word became a chip and the box is empty — ready for the next one.
	await expect(chips().filter({ hasText: 'household' })).toBeVisible();
	await expect(tags()).toHaveValue('');

	// A comma does the same.
	await tags().fill('urgent');
	await tags().press(',');
	await expect(chips().filter({ hasText: 'urgent' })).toBeVisible();
	await expect(tags()).toHaveValue('');

	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('Ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	// A second task: the words from the first are offered back as they are typed.
	await page.reload();
	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('[name="heading"]').first().fill('Book the MOT');

	await tags().click();
	await tags().fill('hous');
	const suggestions = page.locator('[role="listbox"]');
	const option = suggestions.getByRole('option', { name: 'household' });
	await expect(option).toBeVisible({ timeout: 30_000 });
	await option.click();

	// Choosing one also leaves the box empty.
	await expect(chips().filter({ hasText: 'household' })).toBeVisible();
	await expect(tags()).toHaveValue('');

	// Backspace on an empty box takes the last chip off.
	await tags().press('Backspace');
	await expect(chips().filter({ hasText: 'household' })).toHaveCount(0);
});

test('a word left in the box when the form is saved still counts', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-unfinished'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('[name="heading"]').first().fill('Cancel the gym');
	// Typed and never ended with a space — pressing Save means it anyway.
	await page.getByLabel('New task').locator('input[role="combobox"]').first().fill('fitness');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('Cancel the gym').first()).toBeVisible({ timeout: 30_000 });

	// It reached the server as a real tag: the account's vocabulary has it, so
	// the list can be narrowed to it.
	await page.reload();
	// The tag filter is the app's own menu now rather than a `<select>` — see
	// `Picker`.
	const filter = page.getByRole('button', { name: /Filter by tag/i });
	await expect(filter).toBeVisible({ timeout: 30_000 });
	await filter.click();
	await expect(page.getByRole('option', { name: 'fitness', exact: true })).toHaveCount(1);
});

/**
 * One press, one label.
 *
 * A single click on a chip's × was reaching the next chip's handler too, so
 * removing one took two off. The keyboard path was unaffected, which is why
 * the rest of the suite did not see it.
 */
test("pressing one chip's remove button takes exactly one off", async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('chip-remove'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('[name="heading"]').first().fill('Sand the door');

	const form = page.getByLabel('New task');
	const box = form.locator('input[role="combobox"]').first();
	await box.fill('a1 wood paint');
	await box.press(' ');
	await expect(form.locator('.chip')).toHaveCount(3);

	// The real click, not the keyboard — this is the path that was wrong.
	await page.getByRole('button', { name: 'Remove wood' }).click();
	await expect(form.locator('.chip')).toHaveCount(2);
	await expect(form.locator('.chip').filter({ hasText: 'a1' })).toBeVisible();
	await expect(form.locator('.chip').filter({ hasText: 'paint' })).toBeVisible();

	// And again, from the middle of what is left.
	await page.getByRole('button', { name: 'Remove a1' }).click();
	await expect(form.locator('.chip')).toHaveCount(1);
	await expect(form.locator('.chip').filter({ hasText: 'paint' })).toBeVisible();
});
