import { expect, test } from '@playwright/test';
import { clientAddress } from './helpers/account';
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
	// No account link any more — the address itself is still on the page,
	// where the recent-events card correctly names who was deleted.
	await expect(page.getByRole('link', { name: new RegExp(email, 'i') })).toHaveCount(0);
	await expect(page.getByText('account deleted')).toBeVisible();
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
	for (const path of [
		'/api/auth/admin/impersonate-user',
		'/api/auth/admin/stop-impersonating',
		'/api/auth/admin/set-user-password',
		'/api/auth/admin/remove-user',
		'/api/auth/admin/create-user',
		'/api/auth/admin/list-users'
	]) {
		const res = await page.request.post(path, {
			headers: { Origin: ORIGIN },
			data: { userId: 'anybody', newPassword: 'hunter2hunter2' }
		});
		expect(res.status(), `${path} is not a door`).toBe(404);
	}

	// And the raw change-email endpoint, which would skip the settings form's
	// password check and the instance's allowEmailChange switch.
	const changed = await page.request.post('/api/auth/change-email', {
		headers: { Origin: ORIGIN },
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
	const email = `not-an-admin-${Date.now()}@ontoplano.test`;
	const res = await page.request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': address },
		data: { email, password: 'hunter2hunter2', name: 'Nobody' }
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
