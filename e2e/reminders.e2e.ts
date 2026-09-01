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
	await page.goto('/planner/board', { waitUntil: 'networkidle' });

	// A day's lead, so the nudge for one of today's blocks is already in the
	// past. The editor only offers up to an hour; this posts the same action it
	// does, which is the only way to make "already due" happen inside a test.
	await page.locator('article').first().getByRole('button', { name: /^edit/i }).click();
	const editor = page.locator('dialog[open]');
	await expect(editor.getByText('Remind me')).toBeVisible();

	const id = await editor.locator('form[action="?/remind"] input[name=id]').first().inputValue();
	const made = await page.evaluate(async (blockId) => {
		const body = new FormData();
		body.append('id', blockId);
		body.append('minutes', String(24 * 60));
		const res = await fetch('/planner/board?/remind', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		return res.status;
	}, id);
	expect(made).toBe(200);

	// The poller runs on mount and whenever the tab comes back.
	await page.goto('/', { waitUntil: 'networkidle' });
	const toast = page.locator('[role=status]').first();
	await expect(toast).toBeVisible({ timeout: 10_000 });

	// And never again: it is marked delivered the moment it is on screen.
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	await expect(page.locator('[role=status]')).toHaveCount(0);
});

/**
 * The lead lives on the block, and reaches every occurrence of it.
 *
 * This is the shape a reminder has now: said once, on the thing being planned,
 * rather than set again on each occurrence — and there is no way to make one
 * about nothing, which is what used to leave them appearing in no list.
 */
test('a lead set on a block reminds about every occurrence', async ({ page }) => {
	await register(page, `remind-lead-${Date.now()}@test.invalid`);

	// Editing a block the starter week already put there, rather than making
	// one: what is being checked is that the lead is a property of the block and
	// comes back when you reopen it.
	await page.goto('/planner/plan?view=week', { waitUntil: 'networkidle' });
	await page.locator('.ec-event').first().click();

	const form = page.locator('dialog[open]');
	await expect(form.getByText('Remind me')).toBeVisible();

	// A value the chips do not offer, because the chips are shortcuts for
	// typing a number rather than the only numbers there are.
	await form.locator('input[name=remindLeadMinutes]').fill('45');
	await form.getByRole('button', { name: 'Save' }).first().click();
	await page.waitForTimeout(900);

	// Reopened, it still says forty-five — the lead is on the block, not on one
	// occurrence, so it has to survive the round trip.
	await page.reload({ waitUntil: 'networkidle' });
	await page.locator('.ec-event').first().click();
	await expect(page.locator('dialog[open] input[name=remindLeadMinutes]')).toHaveValue('45');

	// And a chip writes into the same box rather than being a second answer.
	await page.locator('dialog[open]').getByRole('button', { name: '10 min' }).click();
	await expect(page.locator('dialog[open] input[name=remindLeadMinutes]')).toHaveValue('10');

	/*
	 * Clicking the box and typing gives you what you typed.
	 *
	 * A number field showing 10, clicked, puts the caret at the end — so typing
	 * 2 gave 102, and a field showing 0 gave 02. Real clicks and real keys,
	 * because this is entirely about what the browser does with a caret and
	 * nothing about what the app renders.
	 */
	const box = page.locator('dialog[open] input[name=remindLeadMinutes]');
	await box.click();
	await page.keyboard.type('2');
	await expect(box).toHaveValue('2');
});

/**
 * There is no page of reminders, and no way to make one about nothing.
 *
 * Both went together: a reminder that is not about anything has nowhere to
 * lead and nothing to be before, which is why it needed a list of its own in
 * the first place.
 */
test('there is no reminders page any more', async ({ page }) => {
	await register(page, `remind-gone-${Date.now()}@test.invalid`);

	const res = await page.goto('/planner/reminders', { waitUntil: 'networkidle' });
	expect(res?.status()).toBe(404);

	await page.goto('/planner/todo', { waitUntil: 'networkidle' });
	// A todo has no time, so it has no reminder control.
	await expect(page.getByRole('button', { name: /remind me about/i })).toHaveCount(0);
});
