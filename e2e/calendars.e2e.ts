import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * Subscribing to a calendar somebody else controls.
 *
 * The address is typed by a person and fetched by the *server*, which is the
 * shape of a request-forgery hole — so the one thing worth proving in a browser
 * is that an address pointing back at this machine is refused where somebody
 * can see it, rather than quietly attempted.
 */
test('an address pointing at this machine is refused, and says so', async ({ page }) => {
	await register(page, `ical-${Date.now()}@test.invalid`);
	await page.goto('/planner/plan', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: /schemes/i }).click();
	await expect(page.getByText('Calendars you subscribe to')).toBeVisible();

	await page.locator('input[name=label]').last().fill('Sneaky');
	await page.locator('input[name=url]').fill('http://127.0.0.1:1493/private.ics');
	await page.getByRole('button', { name: /^subscribe$/i }).click();

	await expect(page.getByText(/points back at this machine/i)).toBeVisible();
	await expect(page.getByText('No calendars subscribed yet')).toBeVisible();
});
