import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { REMINDER_LEAD_MS } from '../src/lib/reminder-window';

/** The app's own origin, which a form POST has to come from. */
const ORIGIN = 'http://localhost:4173';

/**
 * What the app has told you, where you can read it again.
 *
 * A push happens once: it lands on whichever device was awake, somebody
 * clears a lock screen, and it is gone. So the only place "what did it say
 * while I was out" has an answer is inside the app — and the badge is the
 * thing that says there is an answer worth opening.
 *
 * The rule that matters most is that being on screen is being read. A count
 * which survives being looked at is a count people stop believing, and then a
 * badge nobody looks at.
 */
/**
 * Make the app actually say something, the way it really does.
 *
 * A reminder a little way out, its clock wound forward, and then the delivery
 * pass the box runs on a timer — which goes through `pushToUser`, where a
 * notification is written down. So this exercises the real wiring rather than
 * reaching past it into the table.
 *
 * Ahead rather than in the past, because the app refuses a reminder for a time
 * that has already been — rightly — and by `REMINDER_LEAD_MS` for one it could
 * not promise to ring. Read from the app rather than written here: it was a
 * minute, the floor arrived, and every test in this file failed in `sendOne`
 * saying a reminder had no notification rather than that it had no reminder.
 * The pass takes the moment to work from, so the test moves the moment instead.
 */
async function sendOne(page: import('@playwright/test').Page, message: string) {
	/*
	 * The account's clock, which is the server's, which this suite pins to UTC
	 * — see `TZ` in `playwright.config.ts`. Built from the ISO string for that
	 * reason: the machine running the tests is on its own zone, and a wall
	 * clock taken from *it* was three hours behind the account's, so every
	 * reminder this made was refused for having already been.
	 */
	const soon = new Date(Date.now() + REMINDER_LEAD_MS + 90_000).toISOString();
	const day = soon.slice(0, 10);
	const time = soon.slice(11, 16);

	const set = await page.request.post('/reminders?/create', {
		headers: { Origin: ORIGIN, 'x-sveltekit-action': 'true' },
		form: { day, time, label: message }
	});
	// A form action answers 200 whether it wrote or refused, and naming one
	// refusal to rule out is how the last one went unnoticed: the write has to
	// say it succeeded.
	const said = await set.text();
	expect(said, said).toContain('"type":"success"');

	/*
	 * And then the pass, told to work from an hour later.
	 *
	 * The reminder is a minute out because the app refuses to set one for a
	 * time that has already been — rightly — and the pass would not consider
	 * it due until then. `?at=` is how an operator replays a window the box
	 * was down for, and it is what lets this test not spend a minute waiting
	 * for a clock.
	 */
	const ran = await page.request.post('/api/jobs/reminders', {
		headers: { 'x-health-token': 'playwright-health-token' },
		params: { at: new Date(Date.now() + 60 * 60_000).toISOString() }
	});
	const job = (await ran.json()) as { due?: number };
	expect(job.due, JSON.stringify(job)).toBeGreaterThan(0);
}

test('the bell carries a count, and reading them clears it', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1200, height: 900 });
	await register(page, testEmail('notify-bell'));
	await visit(page, '/');

	await sendOne(page, 'the first thing');
	await sendOne(page, 'the second thing');
	await page.reload();

	const bell = page.locator('[data-notifications]');
	await expect(bell).toBeVisible();
	await expect(bell.locator('[data-unread]')).toHaveText('2');

	await bell.click();
	await expect(page.getByText('the first thing')).toBeVisible();
	await expect(page.getByText('the second thing')).toBeVisible();

	// Seen, so the badge is gone — and stays gone when the page comes back.
	await expect(bell.locator('[data-unread]')).toHaveCount(0);
	await page.reload();
	await expect(page.locator('[data-notifications] [data-unread]')).toHaveCount(0);
});

test('the phone wears a dot, and the fan carries the number', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('notify-phone'));
	await visit(page, '/');

	await sendOne(page, 'something happened');
	await page.reload();

	/*
	 * A dot out here and a number one press in. A number in the bar would be
	 * smaller than the thing it counts, and all a bar has to say is that
	 * something happened.
	 */
	await expect(page.locator('[data-unread-dot]')).toBeVisible();

	const account = page.locator('[data-tour="menu"]').last();
	const box = await account.boundingBox();
	if (!box) throw new Error('no account button');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(700);

	await expect(page.locator('[data-waiting]')).toHaveText('1');
	await page.mouse.up();
});

/**
 * And the petal opens the list, with something unread waiting.
 *
 * The one that has news is the one that closed itself: reading them marks
 * them read, marking them read reloads the shell's data, and that reload took
 * the history entry the dialog was holding — so the list appeared and went
 * again in the same frame, every time there was actually something to read.
 * Unread, therefore, or the test passes over the bug.
 */
test('the fan opens what the app has said, and it stays open', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 412, height: 915 });
	await register(page, testEmail('notify-open'));
	await visit(page, '/');

	await sendOne(page, 'something happened');
	await page.reload();

	const account = page.locator('[data-tour="menu"]').last();
	const box = await account.boundingBox();
	if (!box) throw new Error('no account button');
	// Pressed and let go: the tap that opens the fan and chooses nothing.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.up();

	await page.getByRole('menuitem', { name: 'Notifications' }).click();

	const list = page.getByRole('dialog', { name: 'Notifications' });
	await expect(list).toBeVisible();
	await expect(page.getByText('something happened')).toBeVisible();
	// Still there after the reading has been written down and the shell has
	// caught up, which is the moment it used to vanish.
	await page.waitForTimeout(1200);
	await expect(list).toBeVisible();
});
