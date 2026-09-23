import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A reminder is listed at the time it was set for.
 *
 * The column holds wall clock in the account's own zone, so nothing about it
 * depends on where the box is — except that the list turned the string into a
 * `Date` first, which reads it in the machine's zone, and then formatted it in
 * the account's. On a container at −03:00 held by an account on UTC, 11:55 PM
 * was listed at 2:55 the next morning.
 */
test('the time a reminder was set for is the time it is listed at', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('reminder-time'));

	// An account whose zone is not the machine's, which is what the bug needed.
	await visit(page, '/settings/preferences');
	const zone = page.locator('select[name="timezone"]');
	await zone.selectOption('Asia/Tokyo');
	await page.locator('form', { has: zone }).getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Week saved.')).toBeVisible();

	/*
	 * Three days out, in the account's zone: far enough from the lead time and
	 * from either end of a day, near enough to be inside the window the list
	 * shows.
	 */
	const inTokyo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });
	const day = inTokyo.format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
	const at = '23:55';

	await visit(page, '/reminders');
	await page.getByRole('button', { name: 'New reminder' }).first().click();
	const form = page.getByRole('dialog');
	await form.locator('input[name="day"]').fill(day);
	await form.locator('input[name="time"]').fill(at);
	// `label` is a `OneLine`, which is a textarea that behaves like a field.
	await form.locator('[name="label"]').fill('ring at five to midnight');
	await form.getByRole('button', { name: 'Set it' }).click();

	// The list shows a window; the default one may be shorter than three days.
	await page.getByRole('button', { name: '7', exact: true }).first().click();

	const row = page.locator('li, tr', { hasText: 'ring at five to midnight' }).first();
	await expect(row).toBeVisible({ timeout: 10_000 });
	// 11:55 PM, in whichever clock the account reads — never 2:55, and never
	// the fifteenth.
	await expect(row).toContainText(/11:55|23:55/);
	await expect(row).toContainText(String(Number(day.slice(8, 10))));
});
