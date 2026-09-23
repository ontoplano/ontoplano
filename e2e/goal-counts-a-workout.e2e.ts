import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { choose } from './helpers/choose';

/**
 * A goal whose number comes from the workout register.
 *
 * "Run 100 km this quarter" is a total the sessions already hold, and asking
 * somebody to type it into a goal as well is asking them to keep two copies of
 * one fact. So the goal counts it: the figure is read, there is no box to
 * overwrite it, and the word it counts is shown so the number is not a
 * mystery.
 */
test('a goal can count a workout measure, and the number is read not typed', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('goal-measure'));

	// A session with something measured in it, so there is a word to count.
	await visit(page, '/health/workouts');
	await page.getByRole('button', { name: /New workout/ }).click();
	await page.getByRole('dialog').locator('[name="heading"]').fill('Running');
	await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Running').first()).toBeVisible();

	await page.getByRole('button', { name: 'Write down what you did for Running' }).click();
	const log = page.getByRole('dialog');
	await log.locator('[name="measureActivity"]').first().fill('ran');
	await log.locator('[name="measureAmount"]').first().fill('12');
	await log.locator('[name="measureUnit"]').first().fill('km');
	await log.getByRole('button', { name: 'Write it down' }).click();
	await expect(page.getByText(/last done/).first()).toBeVisible();

	// Now the goal, told to count it.
	await visit(page, '/goals');
	await page.getByRole('button', { name: 'New goal' }).first().click();
	await page.locator('#goal-form [name="heading"]').fill('run 100km this quarter');
	await choose(page.locator('#goal-form'), 'horizon', 'Quarter');
	await page.locator('#goal-form [name="targetValue"]').first().fill('100');
	await page.locator('#goal-form [name="targetUnit"]').first().fill('km');

	// Offered only because something has actually been measured.
	const counted = page.locator('#goal-form [data-picker="targetMeasure"]').first();
	await expect(counted).toBeVisible();
	await choose(page.locator('#goal-form'), 'targetMeasure', /^ran/);
	// Choosing one takes the unit from the register, so two spellings of one
	// unit do not become two units.
	await expect(page.locator('#goal-form [name="targetUnit"]').first()).toHaveValue('km');

	await page.getByRole('button', { name: 'Create goal' }).click();
	await expect(page.getByText('run 100km this quarter')).toBeVisible();

	// The figure came from the session, not from anything typed into the goal.
	await expect(page.getByText('12', { exact: false }).first()).toBeVisible();
	await expect(page.getByText('/ 100 km').first()).toBeVisible();
	// The word it counts is shown, so the number is not a mystery.
	await expect(page.getByTitle('Counted from your workouts').first()).toBeVisible();
	// And there is nothing to overwrite it with: no box, no plus, no minus.
	await expect(page.locator('input[name="currentValue"]')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /One more/ })).toHaveCount(0);
});
