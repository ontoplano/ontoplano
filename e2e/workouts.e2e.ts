import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Workouts, the Health tab, driven the way a person uses it.
 *
 * A workout is written down, marked done, edited, archived and deleted — the
 * whole life of one — and the delete is confirmed in its own dialog, never
 * under the icon that asked for it. Checked at phone width too, because Health
 * is used on the phone at the gym as much as anywhere.
 */
test('a workout can be added, done, edited, and deleted behind a confirmation', async ({
	page
}) => {
	await register(page, `workouts-${Date.now()}@example.test`);

	await visit(page, '/health/workouts');
	await expect(page.getByRole('link', { name: 'Workouts' })).toBeVisible();

	// Add one.
	await page.getByRole('button', { name: /New workout/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Push day');
	await add.locator('[name="kind"]').selectOption('strength');
	await add.locator('[name="minutes"]').fill('50');
	await add.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Push day')).toBeVisible();

	// Mark it done — it stamps a last-done date.
	await page
		.locator('li', { hasText: 'Push day' })
		.getByRole('button', { name: /^Mark .* done$/ })
		.click();
	await expect(page.locator('li', { hasText: 'Push day' }).getByText(/last done/)).toBeVisible();

	// Edit the length.
	await page
		.locator('li', { hasText: 'Push day' })
		.getByRole('button', { name: 'Edit Push day' })
		.click();
	const edit = page.getByRole('dialog');
	await edit.locator('[name="minutes"]').fill('60');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('li', { hasText: 'Push day' }).getByText(/60 min/)).toBeVisible();

	// Phone width — it still reads.
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText('Push day')).toBeVisible();
	await page.screenshot({ path: 'test-results/workouts-phone.png' });
	await page.setViewportSize({ width: 1200, height: 900 });

	// Archive, then delete behind the confirmation dialog.
	await page
		.locator('li', { hasText: 'Push day' })
		.getByRole('button', { name: 'Archive Push day' })
		.click();
	await page.getByRole('button', { name: /Archived/ }).click();
	await page
		.locator('li', { hasText: 'Push day' })
		.getByRole('button', { name: 'Delete Push day' })
		.click();
	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText(/deleted for good/)).toBeVisible();
	await page.waitForTimeout(600); // the confirm button is armed
	await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Push day')).toHaveCount(0);
});

/**
 * A workout put on a day is the same thing seen from two rooms.
 *
 * Health says what the session is; the week says when. The block points at
 * the workout rather than copying it, so finishing it on the plan finishes
 * the workout — which is the whole reason to bind them rather than leave
 * somebody keeping a task and a workout in step by hand.
 */
test('a workout can be planned onto a day, and finishing it there finishes the workout', async ({
	page
}) => {
	await register(page, `workout-plan-${Date.now()}@example.test`);

	await visit(page, '/health/workouts');
	await page.getByRole('button', { name: /New workout/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Leg day');
	await add.locator('[name="kind"]').selectOption('strength');
	await add.locator('[name="minutes"]').fill('45');
	await add.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Leg day')).toBeVisible();

	// The plan is readable without opening the form.
	await page.getByRole('button', { name: 'Show the plan for Leg day' }).click();
	await expect(page.getByText(/No plan written yet/)).toBeVisible();

	// Put it on today.
	await page
		.locator('li', { hasText: 'Leg day' })
		.getByRole('button', { name: /^Plan .* onto a day$/ })
		.click();
	const plan = page.getByRole('dialog');
	await expect(plan.getByRole('heading', { name: 'Put it on a day' })).toBeVisible();
	// Its usual length is the block's default.
	await expect(plan.locator('[name="durationMinutes"]')).toHaveValue('45');
	await plan.getByRole('button', { name: 'Put on the day' }).click();

	// It is on the week, and finishing it there stamps the workout.
	await visit(page, '/tasks/plan');
	await expect(page.getByText('Leg day').first()).toBeVisible();

	await visit(page, '/health/workouts');
	await page
		.locator('li', { hasText: 'Leg day' })
		.getByRole('button', { name: /^Mark .* done$/ })
		.click();
	await expect(page.locator('li', { hasText: 'Leg day' }).getByText(/last done/)).toBeVisible();
});

/**
 * The other direction: planned from the week rather than from the workout.
 *
 * From the plan the block carries no label — it is not a name somebody typed,
 * it is a workout — and it drew itself as a grey box called "Untitled" because
 * nothing joined the workout's title in. Planning it from the workout hid this,
 * since that path writes a label too.
 */
test('a workout planned from the week is named after the workout', async ({ page }) => {
	await register(page, `workout-from-plan-${Date.now()}@example.test`);

	await visit(page, '/health/workouts');
	await page.getByRole('button', { name: /New workout/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Pull day');
	await add.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Pull day')).toBeVisible();

	await visit(page, '/tasks/plan');
	await page.getByRole('button', { name: '+ New' }).click();
	const block = page.getByRole('dialog');
	await block.locator('[name="mode"]').selectOption('workout');
	// No category is asked for: being a workout is what it is filed under.
	await block.locator('[name="workoutId"]').selectOption({ label: 'Pull day' });
	await block.locator('[name="startTime"]').fill('07:00');
	await block
		.getByRole('button', { name: /^(Add|Create|Save)/ })
		.last()
		.click();
	await expect(block).toBeHidden();

	await expect(page.getByText('Pull day').first()).toBeVisible();
	await expect(page.getByText('Untitled')).toHaveCount(0);
});

/** The old address, which is in bookmarks and in installed app shells. */
test('the trainings address lands on the workouts', async ({ page }) => {
	await register(page, `workouts-moved-${Date.now()}@example.test`);
	await visit(page, '/health/trainings');
	await expect(page).toHaveURL(/\/health\/workouts/);
});
