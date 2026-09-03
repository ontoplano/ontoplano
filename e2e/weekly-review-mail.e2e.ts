import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The switch for Monday's mail, and the way out of it.
 *
 * The interesting one is the second: an unsubscribe link has to work with no
 * session, because the person clicking it is by definition the one who stopped
 * signing in. A link that lands on the login page is not an unsubscribe link,
 * and a mail whose unsubscribe does not work is the kind of thing a mailbox
 * provider notices before a person complains.
 */
test('the weekly review is off until it is asked for', async ({ page }) => {
	await register(page, `review-mail-${Date.now()}@test.invalid`);
	await visit(page, '/settings/account');

	// Scoped by the form rather than by the card's markup: the card is a
	// component and its wrapper is its own business.
	const toggle = page.locator('form[action="?/setWeeklyReviewMail"] button');

	// Off is what a new account gets: mail nobody asked for is spam however
	// useful it is.
	await expect(page.getByText(/^Off\./)).toBeVisible();
	await expect(toggle).toHaveText('Turn on');

	await toggle.click();
	await expect(page.getByText(/One message on a Monday at \d\d:00/)).toBeVisible();
	await expect(toggle).toHaveText('Turn off');

	// And back, because a switch that only goes one way is a trap.
	await toggle.click();
	await expect(toggle).toHaveText('Turn on');
});

test('an unsigned unsubscribe link is a 404, not a way in', async ({ page }) => {
	const response = await page.goto('/mail/weekly-review/off?u=somebody&t=made-up');
	expect(response?.status()).toBe(404);

	// And with nothing at all: still not a redirect to the login page, which
	// would mean the route is behind the session gate after all.
	const bare = await page.goto('/mail/weekly-review/off');
	expect(bare?.status()).toBe(404);
	expect(new URL(page.url()).pathname).not.toBe('/login');
});
