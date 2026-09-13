import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * What was actually done, and how much of it.
 *
 * "Last done" says whether somebody is keeping a workout up and cannot say
 * whether they are getting anywhere with it. A session is a day plus lines of
 * activity, amount and unit in their own words, and the whole point is that
 * the numbers survive: written down, read back under the workout, corrected,
 * and removed.
 */
async function addWorkout(page: import('@playwright/test').Page, title: string) {
	await page.getByRole('button', { name: /New workout/ }).click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').fill(title);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

test('a session is written down, read back, corrected and removed', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, `register-${Date.now()}@example.test`);
	await visit(page, '/health/workouts');
	await addWorkout(page, 'Pull day');

	await page.getByRole('button', { name: 'Write down what you did for Pull day' }).click();
	const log = page.getByRole('dialog');
	await log.locator('[name="doneOn"]').fill('2026-09-10');
	await log.locator('[name="measureActivity"]').first().fill('deadlifted');
	await log.locator('[name="measureAmount"]').first().fill('120');
	await log.locator('[name="measureUnit"]').first().fill('kg');
	await log.locator('[name="notes"]').fill('felt heavy');
	await log.getByRole('button', { name: 'Write it down' }).click();

	// Read back under the workout, in the words it was given.
	await page.getByRole('button', { name: 'Show the plan for Pull day' }).click();
	await expect(page.getByText('deadlifted 120 kg')).toBeVisible();
	await expect(page.getByText('felt heavy')).toBeVisible();

	// The next session opens on what was measured last time, amounts blank, so
	// nobody types "deadlifted" twice.
	await page.getByRole('button', { name: 'Write down what you did for Pull day' }).click();
	await expect(page.getByRole('dialog').locator('[name="measureActivity"]').first()).toHaveValue(
		'deadlifted'
	);
	await expect(page.getByRole('dialog').locator('[name="measureAmount"]').first()).toHaveValue('');
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

	// Corrected: the lines are replaced by what the form now says.
	await page.getByRole('button', { name: 'Correct the session on 2026-09-10' }).click();
	await page.getByRole('dialog').locator('[name="measureAmount"]').first().fill('125');
	await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('deadlifted 125 kg')).toBeVisible();

	// And removed, behind its own confirmation.
	await page.getByRole('button', { name: 'Remove the session on 2026-09-10' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByText('deadlifted 125 kg')).toHaveCount(0);
});

test('a workout with history is archived rather than deleted', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, `register-keep-${Date.now()}@example.test`);
	await visit(page, '/health/workouts');
	await addWorkout(page, 'Easy 5k');

	// The quick tick is a session too, so there is history behind it at once.
	await page.getByRole('button', { name: 'Mark Easy 5k done' }).click();
	await expect(page.getByText(/last done/)).toBeVisible();

	await page.getByRole('button', { name: 'Archive Easy 5k' }).click();
	await page.getByRole('button', { name: /Archived/ }).click();
	await page.getByRole('button', { name: 'Delete Easy 5k' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

	// Refused, and it says why: deleting the plan would take the register too.
	await expect(page.getByText(/Archive it instead/)).toBeVisible();
});

/**
 * What a workout says it measures, and what that does to the form.
 *
 * Declared on the workout itself — names and units, no numbers — so writing a
 * session down is filling in figures beside words somebody already chose.
 */
test('a workout declares what it measures, and the log form opens on it', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, `declared-${Date.now()}@example.test`);
	await visit(page, '/health/workouts');

	await page.getByRole('button', { name: /New workout/ }).click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').fill('Long run');
	await form.locator('[name="planActivity"]').first().fill('ran');
	await form.locator('[name="planUnit"]').first().fill('km');
	// Typing into the last row grows the list, the way a spreadsheet does.
	await expect(form.locator('[name="planActivity"]')).toHaveCount(2);
	await form.locator('[name="planActivity"]').nth(1).fill('pace');
	await form.locator('[name="planUnit"]').nth(1).fill('min/km');
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Long run').first()).toBeVisible();

	// The session form opens on them, in that order, with nothing filled in.
	await page.getByRole('button', { name: 'Write down what you did for Long run' }).click();
	const log = page.getByRole('dialog');
	await expect(log.locator('[name="measureActivity"]').first()).toHaveValue('ran');
	await expect(log.locator('[name="measureUnit"]').first()).toHaveValue('km');
	await expect(log.locator('[name="measureActivity"]').nth(1)).toHaveValue('pace');
	await expect(log.locator('[name="measureAmount"]').first()).toHaveValue('');

	// One line each, not one per place it was named: what the workout declares
	// and what past sessions measured are the same two things here.
	await log.locator('[name="measureAmount"]').first().fill('12');
	await log.getByRole('button', { name: 'Write it down' }).click();
	await page.getByRole('button', { name: 'Show the plan for Long run' }).click();
	await expect(page.getByText('12')).toBeVisible();

	await page.getByRole('button', { name: 'Write down what you did for Long run' }).click();
	await expect(page.getByRole('dialog').locator('[name="measureActivity"]')).toHaveCount(3);
});
