import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The administration area, as somebody arrives at it.
 *
 * Two things here were reported by a person using the app rather than by a
 * test: Administration was a tab you could enter and not leave, and the page
 * said nothing about the layer in front of it. Both are checked from the tab
 * row down, because both were invisible to assertions about a single page.
 *
 * It runs after `app`, since the administrator is the oldest account and the
 * other project is what makes accounts.
 */

const ORIGIN = 'http://localhost:4173';

let attempt = 0;

/** Whoever signed up first owns the instance, and the suite uses two passwords. */
async function signInAsOwner(page: import('@playwright/test').Page): Promise<void> {
	// Not read-only: the server keeps this in WAL mode, and a read-only handle
	// cannot attach to the shared-memory index — it would see a snapshot from
	// before the accounts this depends on.
	const db = new Database(process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db'));
	const first = db.prepare('select email from user order by created_at limit 1').get() as
		| { email: string }
		| undefined;
	db.close();
	expect(first, 'no accounts in the test database').toBeTruthy();

	// A fresh address per attempt: credential submission is rate limited per
	// client, and two tests each trying two passwords from one address is enough
	// to spend that budget and fail on the limiter rather than on the bug.
	for (const password of ['smoke-test-password', 'hunter2hunter2']) {
		attempt += 1;
		const res = await page.request.post('/api/auth/sign-in/email', {
			headers: { Origin: ORIGIN, 'x-forwarded-for': `10.31.0.${attempt}` },
			data: { email: first!.email, password }
		});
		if (res.ok()) return;
	}
	throw new Error(`could not sign in as ${first!.email}`);
}

test('administration is a tab you can leave again', async ({ page }) => {
	await signInAsOwner(page);
	await page.goto('/admin');

	// The tab row is there, and it knows where you are.
	const current = page.locator('[aria-current="page"]');
	await expect(current).toHaveText('Administration');

	// And the way back is a click, not a trip through the menu.
	await page.getByRole('link', { name: 'Account', exact: true }).click();
	await expect(page).toHaveURL(/\/settings\/account$/);
	await expect(page.locator('[aria-current="page"]')).toHaveText('Account');
});

test('says what the box has turned away', async ({ page }) => {
	await signInAsOwner(page);
	await page.goto('/admin');

	// The fixture log `e2e/prepare.mjs` writes, read through the same path a
	// real instance uses.
	// Anchored on the card's own description rather than on the word "Blocked",
	// which now also appears inside the rows — each one says whether the
	// address is still out and for how long.
	const blocked = page.locator('section').filter({ hasText: 'What fail2ban has turned away.' });
	await expect(blocked).toContainText('203.0.113.7');
	// Not the jail's name — what the address did.
	await expect(blocked).toContainText('scanner');
	// Both fixture bans are minutes old, so the rolling count must agree with
	// the rows under it — the card once said "0 blocked today" above a ban
	// made just before midnight.
	await expect(blocked).toContainText('2 addresses blocked in the last 24 hours');
	// A ban with no duration reads as "forever", which it never is.
	await expect(blocked).toContainText('still blocked');
});

/**
 * Deleting somebody's account, and the box that has to be typed into first.
 *
 * The button is one row from every other button on the page and the thing it
 * does cannot be undone, so what stands in front of it is not a second click —
 * a click lands where the first one was — but the address of the account being
 * deleted. That catches the mistake actually worth catching: having the wrong
 * account open.
 */
test('deleting an account asks for its address, and means it', async ({ page }) => {
	await signInAsOwner(page);

	// Somebody to delete, made through the front door so it is a real account
	// with real rows behind it.
	const email = `to-delete-${Date.now()}@test.invalid`;
	const made = await page.request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': '10.32.0.1' },
		data: { email, password: 'smoke-test-password', name: 'Doomed' }
	});
	expect(made.ok(), 'the account to delete was created').toBe(true);

	// Signing up signed us in as them; back to the administrator.
	await page.request.post('/api/auth/sign-out', { headers: { Origin: ORIGIN } });
	await signInAsOwner(page);

	await page.goto('/admin');
	await page.fill('[name="q"]', email);
	await page.keyboard.press('Enter');
	await page
		.getByRole('link', { name: new RegExp(email, 'i') })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'Delete this account' })).toBeVisible();

	await page.getByRole('button', { name: 'Delete this account' }).click();
	const confirm = page.locator('[name="confirmEmail"]');
	await expect(confirm).toBeVisible();

	// The wrong address: the button stays out of reach.
	await confirm.fill('somebody.else@test.invalid');
	await expect(page.getByRole('button', { name: 'Delete for good' })).toBeDisabled();

	// The right one, and the account is gone from the search that found it.
	await confirm.fill(email);
	await page.getByRole('button', { name: 'Delete for good' }).click();
	await page.waitForURL(/\/admin/);

	await page.fill('[name="q"]', email);
	await page.keyboard.press('Enter');
	await expect(page.getByText(email, { exact: false })).toHaveCount(0);
});

/**
 * Nobody signs in as anybody.
 *
 * The button is gone from the account page, and the plugin endpoints behind
 * it are shut in front of better-auth — an administrator with a valid
 * session gets the same 404 as a stranger. Removed rather than warned
 * about: an instance that respects privacy does not carry a key to
 * everybody's diary with a banner on it.
 */
test('an administrator cannot become somebody else', async ({ page }) => {
	await signInAsOwner(page);
	await page.goto('/admin');

	// Any account's page: the first row the accounts list offers.
	await page.locator('.account-row a[href^="/admin/"]').first().click();
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByText('Sign in as this account')).toHaveCount(0);

	// The plugin's own doors, with the admin's own session.
	for (const path of ['/api/auth/admin/impersonate-user', '/api/auth/admin/stop-impersonating']) {
		const res = await page.request.post(path, {
			headers: { Origin: ORIGIN },
			data: { userId: 'anybody' }
		});
		expect(res.status(), `${path} is not a door`).toBe(404);
	}
});
