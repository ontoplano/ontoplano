import { expect, test, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TEST_CONFIG_DIR } from '../playwright.config';

/**
 * Who may create an account here.
 *
 * The mode is instance-wide and read per request, so these tests rewrite the
 * config file the server is running against. Serial, and they put the suite's
 * own `open` back afterwards, because every other test registers an account.
 *
 * The order matters in one place: an instance with nobody in it lets the first
 * account through whatever the mode says, or a fresh install could never be
 * used. So the first test here is the one that makes that account.
 */

const ORIGIN = 'http://localhost:4173';
const CONFIG = join(TEST_CONFIG_DIR, 'config.toml');

test.describe.configure({ mode: 'serial' });

function setMode(mode: 'open' | 'invite' | 'closed') {
	const current = readFileSync(CONFIG, 'utf8');
	writeFileSync(CONFIG, current.replace(/mode = "\w+"/, `mode = "${mode}"`));
}

/**
 * Each attempt arrives as its own client.
 *
 * Credential submission is rate-limited per address, and by the time this file
 * runs the rest of the suite has spent that budget from one address. The server
 * trusts `X-Forwarded-For` here, which is what it does behind a proxy.
 */
let client = 0;

function signUp(request: APIRequestContext, invite?: string) {
	const email = `reg-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
	client += 1;
	return request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': `10.9.0.${client}` },
		data: { email, password: 'hunter2hunter2', name: 'Reg', ...(invite ? { invite } : {}) }
	});
}

/**
 * Sign in as whoever owns this instance.
 *
 * The owner is the first account, and by the time this project runs that is
 * whichever account another test file made first — so it is looked up rather
 * than assumed. Every account the suite creates uses the same password.
 */
async function signInAsOwner(request: APIRequestContext): Promise<string> {
	// Not read-only: the server keeps this database in WAL mode, and a read-only
	// connection cannot attach to the shared-memory index — it would quietly see
	// a snapshot from before every account the suite made.
	const db = new Database(process.env.PLAYWRIGHT_DB ?? join(tmpdir(), 'ontoplano-e2e.db'));

	const first = db.prepare('select email from user order by created_at limit 1').get() as
		| { email: string }
		| undefined;
	db.close();

	expect(first, 'no accounts in the test database').toBeTruthy();

	const res = await request.post('/api/auth/sign-in/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': '10.9.9.9' },
		data: { email: first!.email, password: 'hunter2hunter2' }
	});
	expect(res.ok(), await res.text()).toBeTruthy();

	return (res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? '')
		.split(';')[0]
		.trim();
}

test.afterAll(() => setMode('open'));

test('an open instance takes anybody', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	setMode('open');

	const res = await signUp(request);
	expect(res.ok(), await res.text()).toBeTruthy();

	await request.dispose();
});

test('a closed instance refuses a sign-up', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	setMode('closed');

	const res = await signUp(request);
	expect(res.status()).toBe(403);
	// Never says *why*: "closed" and "wrong code" are the same answer, or the
	// refusal describes how the instance is configured.
	expect(await res.text()).toContain('not accepting new accounts');

	await request.dispose();
});

test('invite-only refuses a sign-up with no code and one with a wrong code', async ({
	playwright
}) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	setMode('invite');

	expect((await signUp(request)).status()).toBe(403);
	expect((await signUp(request, 'not-a-real-code')).status()).toBe(403);

	await request.dispose();
});

test('an invitation works exactly once', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	// Minting one is the instance owner's business.
	const cookie = await signInAsOwner(request);

	const made = await request.post('/settings/instance?/createInvite', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { note: 'for the test', expiresInDays: '' }
	});

	const body = (await made.text()).replace(/\\"/g, '"');
	expect(made.status(), body.slice(0, 200)).toBe(200);

	const code = /"([A-Za-z0-9_-]{16,})"/.exec(body)?.[1];
	expect(code, `no code in ${body.slice(0, 200)}`).toBeTruthy();

	setMode('invite');

	const first = await signUp(request, code);
	expect(first.ok(), await first.text()).toBeTruthy();

	// The second time, the same code is a code that has been used.
	expect((await signUp(request, code)).status()).toBe(403);

	await request.dispose();
});
