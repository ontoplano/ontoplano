import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * What the app will interrupt you for, answerable in one place.
 *
 * Each of these decided for itself whether to happen: the review nag always
 * did, bills always did, birthdays always did, the Monday mail was a checkbox
 * on another page, and a block could only say anything if it had been given a
 * lead time by hand. The screen is the feature — a list of notifications with
 * no switches is a list of things being done to you.
 */
test('every notification the app sends has a switch, and the answers stick', async ({ page }) => {
	await register(page, testEmail('notify-settings'));
	await visit(page, '/settings/preferences');

	const section = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Notifications', exact: true }) });
	await expect(section).toBeVisible();

	// Drawn from the list rather than written out, so this is really asking
	// whether the list reached the screen.
	const rows = section.locator('li');
	expect(await rows.count()).toBeGreaterThanOrEqual(6);
	await expect(section.getByText('Blocks, as they start')).toBeVisible();
	await expect(section.getByText('The end of the day')).toBeVisible();
	await expect(section.getByText('The weekly review, by email')).toBeVisible();

	// Nothing changes by the screen appearing: what always happened still does,
	// what never did still does not.
	const blocks = rows.filter({ hasText: 'Blocks, as they start' });
	const bills = rows.filter({ hasText: 'Bills' }).first();
	await expect(blocks.locator('input.toggle')).not.toBeChecked();
	await expect(bills.locator('input.toggle')).toBeChecked();

	// Turned on, and still on when the page is opened again.
	await blocks.locator('input.toggle').check();
	await visit(page, '/settings/preferences');
	await expect(
		section.locator('li').filter({ hasText: 'Blocks, as they start' }).locator('input.toggle')
	).toBeChecked();
});

/**
 * The one with an hour of its own.
 *
 * "The end of the day" is a different time for a baker and a night shift, so
 * it is the account's to choose — and choosing it is part of turning it on
 * rather than a second control beside it.
 */
test('the end of the day is set to an hour, and keeps it', async ({ page }) => {
	await register(page, testEmail('notify-eod'));
	await visit(page, '/settings/preferences');

	const notifications = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Notifications', exact: true }) });
	const row = notifications.locator('li').filter({ hasText: 'The end of the day' });

	// It opens on the hour this account's planner closes on rather than on
	// nothing, because an empty time field is a question with no default.
	const at = row.locator('input[type="time"]');
	await expect(at).not.toHaveValue('');

	await row.locator('input.toggle').check();
	await at.fill('21:30');
	await at.blur();

	await visit(page, '/settings/preferences');
	const again = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Notifications', exact: true }) })
		.locator('li')
		.filter({ hasText: 'The end of the day' });
	await expect(again.locator('input[type="time"]')).toHaveValue('21:30');
	/*
	 * And it is still on.
	 *
	 * Changing the hour used to submit the form with no `on` in it — no submit
	 * button had been pressed — so setting when something arrived turned it
	 * off. The switch carries its own state, so it posts either way.
	 */
	await expect(again.locator('input.toggle')).toBeChecked();
});
