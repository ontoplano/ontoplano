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

	await page.locator('[name="day"]').fill(day);
	await page.locator('[name="time"]').fill('07:30');
	await page.locator('[name="label"]').first().fill('take the bread out');
	await page.getByRole('button', { name: 'Set it' }).click();

	await expect(page.getByText('take the bread out')).toBeVisible({ timeout: 15_000 });

	// And the way back out, because setting one is half of it.
	await page.getByRole('button', { name: /^Remove take the bread out$/ }).click();
	await page.getByRole('button', { name: 'Confirm?' }).click();
	await expect(page.getByText('take the bread out')).toHaveCount(0);
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
