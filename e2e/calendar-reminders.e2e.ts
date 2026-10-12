import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A reminder on the calendar, where it rings.
 *
 * It has no title, so the grid shows the start of its message behind an alarm,
 * the hover card shows the whole of it as written, and pressing it goes to the
 * reminders page, where it is changed.
 */
const MESSAGE = '**Call** the plumber about the leaking kitchen tap';

async function remindTwoDaysOut(page: import('@playwright/test').Page) {
	const at = new Date(Date.now() + 2 * 86_400_000);
	const pad = (n: number) => String(n).padStart(2, '0');
	const day = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
	const made = await page.request.post('/reminders?/create', {
		headers: { origin: new URL(page.url()).origin },
		form: { day, time: '10:00', label: MESSAGE }
	});
	expect(await made.text(), 'the reminder was refused').not.toMatch(/"type":"failure"/);
	return day;
}

test('a reminder is on the week, with its words on hover', async ({ page }) => {
	await page.setViewportSize({ width: 1400, height: 900 });
	await register(page, testEmail('calendar-reminder'));
	await visit(page, '/');
	const day = await remindTwoDaysOut(page);

	await visit(page, `/calendar/calendar?view=week&from=${day}`);
	const event = page.locator('.og-event--reminder');
	await expect(event).toHaveCount(1);
	await expect(event).toContainText('Call the plumber');
	await expect(event).not.toContainText('kitchen tap');
	await expect(event.locator('svg')).toHaveCount(1);

	await event.hover();
	const card = page.locator('[data-block-hover]');
	await expect(card).toContainText('leaking kitchen tap');
	await expect(card.locator('strong')).toHaveText('Call');
	await page.screenshot({ path: 'test-results/calendar-reminder-desktop.png' });

	await event.click();
	await page.waitForURL(/\/reminders/);
});

test('a reminder is on the phone’s day too', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('calendar-reminder-phone'));
	await visit(page, '/');
	const day = await remindTwoDaysOut(page);

	await visit(page, `/calendar/calendar?view=day&from=${day}`);
	await expect(page.getByText('Call the plumber').first()).toBeVisible();
	await page.screenshot({ path: 'test-results/calendar-reminder-phone.png' });
});
