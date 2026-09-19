import { expect, test } from '@playwright/test';
import { PASSWORD, clientAddress, testEmail } from './helpers/account';
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
	// client, and one address spends that budget quickly enough to fail on the
	// limiter rather than on the bug.
	attempt += 1;
	const res = await page.request.post('/api/auth/sign-in/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': `10.31.0.${attempt}` },
		data: { email: first!.email, password: PASSWORD }
	});
	if (res.ok()) return;
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
	const email = testEmail('to-delete');
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
	// No account link any more — the address itself is still on the page,
	// where the recent-events card correctly names who was deleted.
	await expect(page.getByRole('link', { name: new RegExp(email, 'i') })).toHaveCount(0);
	await expect(page.getByText('account deleted')).toBeVisible();
});

/**
 * Admin is not one click away.
 *
 * "Make admin" was an ordinary small button in the row with "Start a trial"
 * and "Resend confirmation", and what it grants is every power on this page —
 * including deleting every other account. A slipped click did it, silently.
 * It is two steps now, and the confirm is armed: the second half of a
 * double-click lands on nothing.
 */
test('granting admin takes a deliberate second press', async ({ page }) => {
	await signInAsOwner(page);

	const email = testEmail('to-promote');
	const made = await page.request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': '10.33.0.1' },
		data: { email, password: 'smoke-test-password', name: 'Hopeful' }
	});
	expect(made.ok(), 'the account to promote was created').toBe(true);

	await page.request.post('/api/auth/sign-out', { headers: { Origin: ORIGIN } });
	await signInAsOwner(page);

	await page.goto('/admin');
	await page.fill('[name="q"]', email);
	await page.keyboard.press('Enter');
	await page
		.getByRole('link', { name: new RegExp(email, 'i') })
		.first()
		.click();
	/*
	 * Wait for the account's own page before touching anything on it.
	 *
	 * Every row on the list carries a "Make admin" of its own, so acting before
	 * the navigation lands finds as many of them as the instance has accounts —
	 * a strict-mode violation rather than a click. It was a race the list won
	 * while the list was short, and the suite registers an account per test, so
	 * the list grows with the suite: adding tests anywhere lost it.
	 */
	await page.waitForURL(/\/admin\/[^/]+$/);
	await page.waitForSelector('html[data-ready]');

	/*
	 * A double-click on the trigger, which is what a slipped click looks like:
	 * the first press opens the confirmation and the second lands on Cancel,
	 * which is deliberately where the trigger was. Nothing comes of it. Were
	 * the confirm to sit there instead, `use:armed` swallows the press for
	 * 450ms — two guards, and this asserts the outcome both exist for.
	 */
	await page.getByRole('button', { name: 'Make admin' }).dblclick();
	await page.reload();
	// The confirmation is a handler, so it does nothing until the page is
	// running — wait for that, or the click below lands on dead markup.
	await page.waitForSelector('html[data-ready]');
	await expect(page.getByRole('button', { name: 'Make admin' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove admin' })).toHaveCount(0);

	/*
	 * What the confirmation says is what is at stake, named.
	 *
	 * Matched within one line of the markup: Playwright normalizes whitespace
	 * for a string but NOT for a regex, so a pattern reaching across the
	 * wrap prettier put in the sentence matches nothing at all.
	 */
	await page.getByRole('button', { name: 'Make admin' }).click();
	await expect(page.getByText(/change and delete every account/)).toBeVisible();

	// Backing out leaves the account where it was.
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

	// And the deliberate version, after the arming delay, does the thing.
	await page.getByRole('button', { name: 'Make admin' }).click();
	const confirm = page.getByRole('button', { name: 'Make admin' });
	await page.waitForTimeout(600);
	await confirm.click();
	await expect(page.getByRole('button', { name: 'Remove admin' })).toBeVisible();
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

	// The plugin's own doors, with the admin's own session. Not only
	// impersonation: set-user-password is impersonation with one extra step,
	// remove-user skips the typed-email confirmation and the audit line, and
	// create-user mints accounts around registration mode. The whole prefix
	// is shut.
	/*
	 * An address of its own per request, or the rate limiter answers first.
	 *
	 * Seven credential posts in a row from one client is exactly what the
	 * limiter exists to stop, so it started returning 429 — and a 429 is not a
	 * 404: the assertion that these doors do not exist was being answered by
	 * something that had not looked at whether they do. It failed only when
	 * this file's earlier tests had already spent some of the budget, which is
	 * why it came and went. Each request now arrives from somewhere new.
	 */
	for (const path of [
		'/api/auth/admin/impersonate-user',
		'/api/auth/admin/stop-impersonating',
		'/api/auth/admin/set-user-password',
		'/api/auth/admin/remove-user',
		'/api/auth/admin/create-user',
		'/api/auth/admin/list-users'
	]) {
		const res = await page.request.post(path, {
			headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
			data: { userId: 'anybody', newPassword: PASSWORD }
		});
		expect(res.status(), `${path} is not a door`).toBe(404);
	}

	// And the raw change-email endpoint, which would skip the settings form's
	// password check and the instance's allowEmailChange switch.
	const changed = await page.request.post('/api/auth/change-email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { newEmail: 'moved@ontoplano.test' }
	});
	expect(changed.status(), 'change-email is the form, not an endpoint').toBe(404);
});

/**
 * The actions are gated on their own, not only the page.
 *
 * SvelteKit does not run the layout's `load` for a POSTed form action, so
 * "the page is behind a check" says nothing about the actions on it — they
 * are each reachable by a bare same-origin POST. Found as a live privilege
 * escalation: any signed-in account could drive the ban controls and empty
 * the mail-failure queue. This posts as a fresh non-admin and expects the
 * same 404 a missing page answers.
 */
test('admin actions refuse a non-admin, page load or no page load', async ({ page }) => {
	const address = clientAddress();
	const email = testEmail('not-an-admin');
	const res = await page.request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': address },
		data: { email, password: PASSWORD, name: 'Nobody' }
	});
	expect(res.ok(), `registering ${email}: ${res.status()}`).toBeTruthy();
	const cookie = (
		res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	for (const [action, form] of [
		['unban', { jail: 'sshd', address: '203.0.113.9' }],
		['blockForever', { address: '203.0.113.9' }],
		['unblockForever', { address: '203.0.113.9' }],
		['dismissReport', { id: '1' }],
		['retryMail', { id: '1' }],
		['dismissMail', { id: '1' }],
		['setRole', { id: 'someone', role: 'admin' }]
	] as const) {
		const posted = await page.request.post(`/admin?/${action}`, {
			headers: {
				Origin: ORIGIN,
				Cookie: cookie,
				'x-sveltekit-action': 'true',
				'x-forwarded-for': address
			},
			form: form as Record<string, string>,
			maxRedirects: 0
		});
		expect(posted.status(), `?/${action} as a non-admin`).toBe(404);
	}

	// And the account page's actions, which take the same wrapper.
	const posted = await page.request.post('/admin/someone?/grantTrial', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'x-forwarded-for': address
		},
		form: {},
		maxRedirects: 0
	});
	expect(posted.status(), 'grantTrial as a non-admin').toBe(404);
});
