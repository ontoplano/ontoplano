import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Everything with a time on it.
 *
 * The two things that have to hold: what is coming shows up before it is due —
 * a birthday next month is not a row in the reminders table and is exactly
 * what somebody opens this page to see — and the weekly-review nag does not,
 * because it is a sentence about now and not an appointment.
 */
test('a birthday shows up before it happens, without anything being run', async ({ page }) => {
	await register(page, `rem-birthday-${Date.now()}@test.invalid`);

	// A fortnight out, so it is ahead of today whatever day this runs on.
	const soon = new Date();
	soon.setDate(soon.getDate() + 14);
	const birthday = `1990-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;

	await visit(page, '/notebooks/people');
	await page
		.getByRole('button', { name: /New person/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="label"]').fill('Marta');
	await form.locator('[name="bornOn"]').fill(birthday);
	await form.getByRole('button', { name: /Add person/ }).click();
	await expect(form).toBeHidden({ timeout: 15_000 });

	await visit(page, '/reminders');
	// No job, no script, no waiting for the morning: the page works it out.
	await expect(page.getByText('Marta', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});

test('the weekly-review nag is sent but is not an appointment', async ({ page }) => {
	await register(page, `rem-review-${Date.now()}@test.invalid`);
	await visit(page, '/reminders');
	await expect(page.locator('main')).toBeVisible();
	// It belongs on a phone at seven in the morning, not in a list of things
	// that are going to happen — the dashboard carries the standing version.
	await expect(page.getByText(/waiting to be reviewed|review is pending/i)).toHaveCount(0);
});

test('an alarm is a day and a time, not one box with six segments', async ({ page }) => {
	await register(page, `rem-alarm-${Date.now()}@test.invalid`);
	await visit(page, '/reminders');

	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const day = tomorrow.toISOString().slice(0, 10);

	// Nothing to set yet, so the button says so rather than looking pressable.
	await expect(page.getByRole('button', { name: 'Set it' })).toBeDisabled();

	await page.locator('[name="day"]').fill(day);
	await page.locator('[name="time"]').fill('07:30');
	await expect(page.getByRole('button', { name: 'Set it' })).toBeDisabled();
	await page.locator('[name="label"]').first().fill('take the bread out');
	await expect(page.getByRole('button', { name: 'Set it' })).toBeEnabled();
	await page.getByRole('button', { name: 'Set it' }).click();

	await expect(page.getByText('take the bread out')).toBeVisible({ timeout: 15_000 });

	// The day goes back to today rather than to nothing: a form that forgets
	// what day it is asks for the date again every single time.
	await expect(page.locator('[name="day"]')).not.toHaveValue('');
	await expect(page.locator('[name="time"]')).toHaveValue('');

	// And the way back out, because setting one is half of it.
	await page.getByRole('button', { name: /^Remove take the bread out$/ }).click();
	await page.getByRole('button', { name: 'Confirm?' }).click();
	await expect(page.getByText('take the bread out')).toHaveCount(0);
});

/*
 * A time is a nicety, not a question.
 *
 * "Remind me on the third" is a whole sentence; making somebody name an hour
 * for it means picking a number that means nothing. Empty is the hour their
 * day starts, and the field says which hour that is.
 */
test('an alarm with no time goes off when the day starts', async ({ page }) => {
	await register(page, `rem-noclock-${Date.now()}@test.invalid`);
	await visit(page, '/reminders');

	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);

	await page.locator('[name="day"]').fill(tomorrow.toISOString().slice(0, 10));
	await page.locator('[name="label"]').first().fill('call the vet');
	// A day and something to say is the whole of it.
	await expect(page.getByRole('button', { name: 'Set it' })).toBeEnabled();

	// The field names the hour rather than describing it, so the row can be
	// checked against what the form promised.
	const hint = await page.getByText(/Empty means \d{2}:\d{2}/).innerText();
	const at = hint.match(/\d{2}:\d{2}/)![0];

	await page.getByRole('button', { name: 'Set it' }).click();
	const row = page.locator('li', { hasText: 'call the vet' }).first();
	await expect(row).toBeVisible({ timeout: 15_000 });
	await expect(row).toContainText(at);
});

/*
 * Both halves of the list end in the same place.
 *
 * Birthdays and bills have always stopped at the horizon; reminders that were
 * already rows were only checked for being in the future, so "the next 1 day"
 * answered with an alarm four months out.
 */
test('what is coming stops where the window does', async ({ page }) => {
	await register(page, `rem-ceiling-${Date.now()}@test.invalid`);
	await visit(page, '/reminders');

	const far = new Date();
	far.setDate(far.getDate() + 45);

	await page.locator('[name="day"]').fill(far.toISOString().slice(0, 10));
	await page.locator('[name="time"]').fill('07:00');
	await page.locator('[name="label"]').first().fill('the far away thing');
	await page.getByRole('button', { name: 'Set it' }).click();
	await expect(page.getByText('the far away thing')).toBeVisible({ timeout: 15_000 });

	await visit(page, '/reminders?days=1');
	await expect(page.getByText('the far away thing')).toHaveCount(0);

	await visit(page, '/reminders?days=60');
	await expect(page.getByText('the far away thing').first()).toBeVisible({ timeout: 15_000 });
});

test('the window can be widened, and stops at a year', async ({ page }) => {
	await register(page, `rem-window-${Date.now()}@test.invalid`);

	// A birthday four months out: outside the default two months, inside a year.
	const far = new Date();
	far.setDate(far.getDate() + 120);
	const birthday = `1985-${String(far.getMonth() + 1).padStart(2, '0')}-${String(far.getDate()).padStart(2, '0')}`;

	await visit(page, '/notebooks/people');
	await page
		.getByRole('button', { name: /New person/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="label"]').fill('Rui');
	await form.locator('[name="bornOn"]').fill(birthday);
	await form.getByRole('button', { name: /Add person/ }).click();
	await expect(form).toBeHidden({ timeout: 15_000 });

	await visit(page, '/reminders');
	await expect(page.getByText('Rui', { exact: false })).toHaveCount(0);

	// Ask further ahead and there it is.
	await visit(page, '/reminders?days=200');
	await expect(page.getByText('Rui', { exact: false }).first()).toBeVisible({ timeout: 15_000 });

	// Past a year the list stops being about what is coming, so it clamps.
	await visit(page, '/reminders?days=9999');
	await expect(page.locator('[name="days"]')).toHaveValue('365');
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('changing how far ahead does not throw you back to the top', async ({ page }) => {
		await register(page, `rem-scroll-${Date.now()}@test.invalid`);
		await visit(page, '/reminders');
		await expect(page.locator('main')).toBeVisible();
		await page.waitForTimeout(500);

		/*
		 * Where the control is on screen, before and after.
		 *
		 * Measured on the element rather than on `window.scrollY`, because which
		 * box actually scrolls is a layout detail and this is not a test about
		 * layout — it is a test about the thing you pressed still being under
		 * your thumb.
		 */
		const seven = page.getByRole('button', { name: '7', exact: true });
		await page.mouse.wheel(0, 260);
		await page.waitForTimeout(400);
		const before = (await seven.boundingBox())!;

		await seven.click();
		await expect(page.getByText(/The next 7 days/)).toBeVisible({ timeout: 15_000 });
		await page.waitForTimeout(400);

		// These were links, and a link is a navigation, which puts you back at
		// the top — so pressing "30" threw you away from the row you pressed.
		const after = (await seven.boundingBox())!;
		expect(Math.round(after.y)).toBe(Math.round(before.y));
	});
});

test('an alarm that will make a noise says so before it does', async ({ page }) => {
	await register(page, `rem-sound-${Date.now()}@test.invalid`);
	await visit(page, '/reminders');

	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const day = tomorrow.toISOString().slice(0, 10);

	// One silent, one not.
	await page.locator('[name="day"]').fill(day);
	await page.locator('[name="time"]').fill('08:00');
	await page.locator('[name="label"]').first().fill('quietly');
	await page.getByRole('button', { name: 'Set it' }).click();
	await expect(page.getByText('quietly')).toBeVisible({ timeout: 15_000 });

	await page.locator('[name="day"]').fill(day);
	await page.locator('[name="time"]').fill('09:00');
	await page.locator('[name="label"]').first().fill('loudly');
	await page.locator('input[name="audible"]').first().check();
	await page.getByRole('button', { name: 'Set it' }).click();
	await expect(page.getByText('loudly')).toBeVisible({ timeout: 15_000 });

	// Whether it rings is the one thing worth knowing before it happens rather
	// than after, so it is on the row.
	const loud = page.locator('li', { hasText: 'loudly' });
	const quiet = page.locator('li', { hasText: 'quietly' });
	await expect(loud.locator('[title="This one makes a sound"]')).toHaveCount(1);
	await expect(quiet.locator('[title="This one makes a sound"]')).toHaveCount(0);
});

/**
 * The time field is the browser's own.
 *
 * There was a hand-drawn clock face here, because Android opens this as
 * typeable digits unless it feels like opening a dial. It looked like nobody's
 * control everywhere the native one is fine, so it is gone: a standard control
 * is the browser's to draw. What still has to hold is that the form posts a
 * time, which is the only part of it this app owns.
 */
test('the time is a plain time field, and the form takes what it gives', async ({ page }) => {
	await register(page, `rem-time-${Date.now()}@test.invalid`);
	await visit(page, '/reminders');
	await expect(page.locator('main')).toBeVisible();

	const time = page.locator('input[name="time"]');
	await expect(time).toHaveAttribute('type', 'time');
	// Not hidden behind anything: the browser's control is the control.
	await expect(time).toBeVisible();

	await time.fill('15:30');
	await expect(time).toHaveValue('15:30');
});

test('a reminder that has already been is not "coming up"', async ({ page }) => {
	await register(page, `rem-past-${Date.now()}@test.invalid`);

	// Written straight in, because the form will not take a time that has been.
	await page.request.post('/reminders?/create', {
		headers: { origin: new URL(page.url()).origin },
		form: {
			day: '2020-01-01',
			time: '09:00',
			label: 'long gone'
		}
	});

	await visit(page, '/reminders');
	await expect(page.locator('main')).toBeVisible();

	// A list called "coming up" holding this morning's alarm is a list you have
	// to read past. Scoped to that card: a reminder whose time has been is also
	// *due*, so it correctly appears in the notification it fires as — which is
	// a thing you dismiss, not a thing that is coming.
	const comingUp = page.locator('section', { hasText: 'Coming up' }).first();
	await expect(comingUp.getByText('long gone')).toHaveCount(0);
});

/**
 * And the same one, when you go looking for it.
 *
 * Hiding what has already fired is right for a list called "Coming up" and
 * wrong as the only view there is — "did that actually go off?" had nowhere to
 * be answered. The window looks either way now.
 */
test('a reminder that has been is still there to look at', async ({ page }) => {
	await register(page, `rem-past-${Date.now()}@test.invalid`);

	// Yesterday, not a decade ago: "the last seven days" means seven days, and
	// a fixture outside the window would be testing the window rather than the
	// direction. The past view is deliberately bounded the same way the
	// forward one is.
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);

	await page.request.post('/reminders?/create', {
		headers: { origin: new URL(page.url()).origin },
		form: {
			day: yesterday.toISOString().slice(0, 10),
			time: '09:00',
			label: 'long gone'
		}
	});

	await visit(page, '/reminders?days=7&past=1');
	await expect(page.locator('main')).toBeVisible();

	const past = page.locator('section', { hasText: 'Already been' }).first();
	await expect(past.getByText('long gone')).toBeVisible();

	// And going back the other way still hides it.
	await visit(page, '/reminders?days=7');
	const comingUp = page.locator('section', { hasText: 'Coming up' }).first();
	await expect(comingUp.getByText('long gone')).toHaveCount(0);
});
