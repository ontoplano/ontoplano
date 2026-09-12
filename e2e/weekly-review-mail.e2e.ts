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

/**
 * The week's note is prose once it is written.
 *
 * It used to be a textarea that never closed, holding whatever the browser
 * had rather than what was stored — so saving twice was impossible to tell
 * apart from saving once. Written, it renders; the pencil opens it again,
 * and what opens is what is stored.
 */
test('a week note is written once, then read', async ({ page }) => {
	await register(page, `note-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/review');

	const note = page.locator('[name="note"]');
	await note.fill('**went well** and the rest');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// Prose, with the markdown actually rendered.
	await expect(page.locator('.md strong', { hasText: 'went well' })).toBeVisible();
	await expect(note).toHaveCount(0);

	// Saving again does not stack a second note beside the first.
	await page.getByRole('button', { name: 'Edit the note' }).click();
	await expect(page.locator('[name="note"]')).toHaveValue('**went well** and the rest');
	await page.locator('[name="note"]').fill('the second thought');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('.md')).toHaveText('the second thought');

	await page.reload();
	await expect(page.locator('.md')).toHaveText('the second thought');
});
