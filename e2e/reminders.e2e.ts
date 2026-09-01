import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The one thing in this app that reaches out.
 *
 * The whole point is that it arrives without being asked for, so what matters
 * is the loop: set one on a block, have it fall due, and see it on the screen
 * — and then see it not arrive a second time.
 */
test('a reminder is set on a block and arrives on its own', async ({ page }) => {
	await register(page, `remind-${Date.now()}@test.invalid`);
	await page.goto('/planner/board', { waitUntil: 'networkidle' });

	// Onboarding filled today, so there is a block to be reminded about.
	const card = page.locator('article').first();
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: /^edit/i }).click();

	const editor = page.locator('dialog[open]');
	await expect(editor.getByText('Remind me')).toBeVisible();

	// An hour before, so it is already overdue for a block earlier in the day —
	// and if it is not, it still has to be listed as set.
	await editor.getByRole('button', { name: /1 hour before/i }).click();
	await page.waitForTimeout(600);

	await expect(page.getByRole('button', { name: /remove the reminder at/i })).toBeVisible();
});

test('what fell due arrives, once', async ({ page }) => {
	await register(page, `remind-due-${Date.now()}@test.invalid`);

	// Set one in the past through the API, which is the same path the UI uses
	// and the only way to make "already due" happen inside a test.
	const past = new Date(Date.now() - 60_000);
	const stamp = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}T${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}`;

	await page.goto('/planner/todo', { waitUntil: 'networkidle' });
	const made = await page.evaluate(async (at) => {
		const body = new FormData();
		body.append('at', at);
		body.append('message', 'take the bread out');
		const res = await fetch('/planner/todo?/remind', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		return res.status;
	}, stamp);
	expect(made).toBe(200);

	// The poller runs on mount and whenever the tab comes back.
	await page.goto('/', { waitUntil: 'networkidle' });
	await expect(page.getByText('take the bread out')).toBeVisible({ timeout: 10_000 });

	// And never again: it is marked delivered the moment it is on screen.
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	await expect(page.getByText('take the bread out')).toHaveCount(0);
});

/**
 * A reminder about nothing had nowhere to be.
 *
 * The card in the corner was the only place one ever appeared: it could not be
 * looked up, and clicking it did nothing. A notification with no page behind it
 * is one you have to trust from memory.
 */
test('a free reminder is on a page of its own, and the card leads to it', async ({ page }) => {
	await register(page, `remind-page-${Date.now()}@test.invalid`);

	await page.goto('/planner/reminders', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /new reminder/i }).click();
	await page.fill('input[name=message]', 'call the landlord back');
	await page.getByRole('button', { name: 'Set it' }).click();

	await expect(page.getByText('call the landlord back')).toBeVisible();
	await expect(page.getByText('on its own')).toBeVisible();

	// And it survives a reload, so the list is reading the database rather than
	// what the form just said.
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.getByText('call the landlord back')).toBeVisible();
});

test('a due card leads to the page the reminder belongs on', async ({ page }) => {
	await register(page, `remind-link-${Date.now()}@test.invalid`);

	const past = new Date(Date.now() - 60_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;

	await page.goto('/planner/reminders', { waitUntil: 'networkidle' });
	await page.evaluate(async (at) => {
		const body = new FormData();
		body.append('at', at);
		body.append('message', 'water the plants');
		await fetch('/planner/reminders?/create', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
	}, stamp);

	await page.goto('/', { waitUntil: 'networkidle' });
	const card = page.getByRole('link', { name: 'water the plants' });
	await expect(card).toBeVisible({ timeout: 10_000 });

	await card.click();
	await expect(page).toHaveURL(/\/planner\/reminders$/);
});
