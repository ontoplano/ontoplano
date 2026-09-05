import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clientAddress } from './helpers/account';

/**
 * The family plan, from the payer's chair and from the seat's.
 *
 * The bug this file exists for: adding an address with no account used to
 * create it through the sign-up endpoint, whose brand-new session the cookie
 * hook wrote onto the payer's own response — so the person who typed the
 * address was suddenly signed in as the unverified member and bounced to the
 * verify wall. What must be true instead: the payer stays themselves and sees
 * a success message, and the invited account chooses a password before the
 * welcome wizard.
 */

const ORIGIN = 'http://localhost:4173';

function openDb() {
	return new Database(process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db'));
}

/** A signed-up account: its id, cookie, and request context. */
async function account(playwright: PlaywrightWorkerArgs['playwright'], tag: string) {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: 'hunter2hunter2', name: 'Family Test' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	const db = openDb();
	const row = db.prepare('select id from user where email = ?').get(email) as { id: string };
	db.close();

	return { request, cookie, email, id: row.id };
}

/** Hand an account a live five-seat family subscription, the way a webhook would. */
function makePayer(userId: string) {
	const db = openDb();
	db.prepare(
		`insert into subscriptions (user_id, plan, status, provider, provider_subscription_id, current_period_end, seats)
		 values (?, 'pro', 'active', 'paddle', 'sub_family_e2e', '2126-01-01T00:00:00.000Z', 5)`
	).run(userId);
	db.close();
}

test('adding somebody by mail leaves the payer signed in as themselves', async ({ playwright }) => {
	const payer = await account(playwright, 'payer');
	makePayer(payer.id);

	const invited = `seatmail-${Date.now()}@example.test`;
	const res = await payer.request.post('/settings/family?/addSeat', {
		headers: { Origin: ORIGIN, Cookie: payer.cookie, 'x-sveltekit-action': 'true' },
		form: { who: invited }
	});
	expect(res.status(), await res.text()).toBe(200);

	// No session cookie rode back on the action: the payer's browser keeps the
	// payer's session, not the invited account's.
	const setCookies = res
		.headersArray()
		.filter((h) => h.name.toLowerCase() === 'set-cookie')
		.map((h) => h.value)
		.join('\n');
	expect(setCookies).not.toContain('session_token=');

	// And the payer is still the payer — the session their cookie answers to
	// is their own, not the invited account's.
	const who = await payer.request.get('/api/auth/get-session', {
		headers: { Cookie: payer.cookie }
	});
	const session = (await who.json()) as { user?: { email?: string } } | null;
	expect(session?.user?.email).toBe(payer.email);

	// The invited account exists, seated, flagged to choose a password first.
	const db = openDb();
	const member = db.prepare('select id from user where email = ?').get(invited) as
		| { id: string }
		| undefined;
	expect(member).toBeTruthy();
	const pending = db
		.prepare('select value from user_settings where user_id = ? and key = ?')
		.get(member!.id, 'account.passwordPending') as { value: string } | undefined;
	const sessions = db
		.prepare('select count(*) as n from session where user_id = ?')
		.get(member!.id) as { n: number };
	db.close();
	expect(pending?.value).toBe('true');
	expect(sessions.n, 'no session may exist for an account nobody signed into').toBe(0);
});

/**
 * The seat's first visit: password before wizard.
 *
 * Exercised with an ordinary signed-in account flagged the way the invite
 * flags one, because the mail's link is better-auth's own verification URL —
 * what is ours to test is the page it lands on.
 */
test('a flagged account is walked to the password page, and through it', async ({ playwright }) => {
	const seat = await account(playwright, 'seatpw');

	const db = openDb();
	db.prepare('insert into user_settings (user_id, key, value) values (?, ?, ?)').run(
		seat.id,
		'account.passwordPending',
		'true'
	);
	db.close();

	// /welcome sends them to the password page first.
	const welcome = await seat.request.get('/welcome', {
		headers: { Cookie: seat.cookie },
		maxRedirects: 0
	});
	expect(welcome.status()).toBe(302);
	expect(welcome.headers()['location']).toContain('/welcome/password');

	// Two fields that disagree are refused with the reason.
	const wrong = await seat.request.post('/welcome/password', {
		headers: { Origin: ORIGIN, Cookie: seat.cookie, 'x-sveltekit-action': 'true' },
		form: { password: 'a-real-password-8', confirm: 'a-different-one-9' }
	});
	expect(await wrong.text()).toContain('not the same');

	// Matching ones are accepted, and the flag falls.
	const ok = await seat.request.post('/welcome/password', {
		headers: { Origin: ORIGIN, Cookie: seat.cookie, 'x-sveltekit-action': 'true' },
		form: { password: 'a-real-password-8', confirm: 'a-real-password-8' }
	});
	expect(ok.status(), await ok.text()).toBe(200);

	const check = openDb();
	const pending = check
		.prepare('select value from user_settings where user_id = ? and key = ?')
		.get(seat.id, 'account.passwordPending') as { value: string } | undefined;
	check.close();
	expect(pending?.value).toBe('false');

	// The chosen password now signs them in.
	const fresh: APIRequestContext = await playwright.request.newContext({ baseURL: ORIGIN });
	const signIn = await fresh.post('/api/auth/sign-in/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email: seat.email, password: 'a-real-password-8' }
	});
	expect(signIn.ok(), await signIn.text()).toBeTruthy();
	await fresh.dispose();
});
