import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { clientAddress } from './helpers/account';

/**
 * The calendar link, and what it refuses.
 *
 * This is the one credential in the app that lives in a URL — a calendar client
 * fetches it from its own servers, with no cookie, no header and no way to be
 * asked anything, so the address is the secret. Which makes the route's refusals
 * the interesting part, and all of them are here:
 *
 *  - a token that is not real, and one that is real but scoped for something
 *    else, both answer 404 rather than telling the difference;
 *  - replacing the link stops the old one immediately, which is what makes
 *    "I pasted it somewhere I should not have" recoverable;
 *  - a powerful token is not honoured just because somebody pasted it here.
 */

const ORIGIN = 'http://localhost:4173';

async function account(playwright: PlaywrightWorkerArgs['playwright']) {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `feed-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: 'hunter2hunter2', name: 'Feed' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	await request.post('/welcome', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: {
			timezone: 'America/Sao_Paulo',
			firstDay: '0',
			generateDay: '6',
			template: 'remote'
		}
	});

	return { request, cookie };
}

/** Press the button on the settings page, and read the URL it shows once. */
async function makeLink(request: APIRequestContext, cookie: string): Promise<string> {
	const res = await request.post('/settings/integrations?/calendarLink', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: {}
	});

	const token = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(token, 'no calendar token in the response').toBeTruthy();
	return `/calendar/${token}`;
}

async function mintToken(
	request: APIRequestContext,
	cookie: string,
	scopes: string
): Promise<string> {
	const res = await request.post('/settings/integrations?/createToken', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { label: `token ${scopes}`, scopes }
	});
	const token = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(token).toBeTruthy();
	return token!;
}

test('the link serves a calendar, to a client carrying nothing at all', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);
	const link = await makeLink(request, cookie);

	// No cookie: this is what Google's servers look like when they fetch it.
	const res = await request.get(link, { headers: { Cookie: '' } });

	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('text/calendar');
	// Kept out of search results: it is a credential.
	expect(res.headers()['x-robots-tag']).toContain('noindex');

	const body = await res.text();
	expect(body.startsWith('BEGIN:VCALENDAR')).toBeTruthy();
	expect(body).toContain('END:VCALENDAR');
	// The starter week the new account chose, so there is something in it.
	expect(body).toContain('BEGIN:VEVENT');

	await request.dispose();
});

test('a wrong address and a wrong scope are the same answer', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);

	const nonsense = await request.get('/calendar/onto_notarealtokenatall', {
		headers: { Cookie: '' }
	});
	expect(nonsense.status()).toBe(404);

	// A real token, belonging to this account, that simply is not for this. It
	// must not work here — a URL is a bad place for a key that can do more, so
	// the route takes `calendar:read` and nothing else. (One scope per field:
	// the action reads `getAll('scopes')`, so a comma-joined string arrives as
	// one unrecognised scope and mints nothing.)
	const powerful = await mintToken(request, cookie, 'schedule:read');
	const wrongScope = await request.get(`/calendar/${powerful}`, { headers: { Cookie: '' } });
	expect(wrongScope.status()).toBe(404);

	await request.dispose();
});

test('replacing the link stops the old one at once', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);

	const first = await makeLink(request, cookie);
	expect((await request.get(first, { headers: { Cookie: '' } })).status()).toBe(200);

	const second = await makeLink(request, cookie);
	expect(second).not.toBe(first);

	// The whole point of the Replace button: every calendar using the old
	// address stops getting the plan, immediately.
	expect((await request.get(first, { headers: { Cookie: '' } })).status()).toBe(404);
	expect((await request.get(second, { headers: { Cookie: '' } })).status()).toBe(200);

	await request.dispose();
});

test("one account's link never carries another account's plan", async ({ playwright }) => {
	const mine = await account(playwright);
	const theirs = await account(playwright);

	const myLink = await makeLink(mine.request, mine.cookie);
	const theirLink = await makeLink(theirs.request, theirs.cookie);

	const myFeed = await (await mine.request.get(myLink, { headers: { Cookie: '' } })).text();
	const theirFeed = await (await theirs.request.get(theirLink, { headers: { Cookie: '' } })).text();

	// Both are real calendars, and no event id from one appears in the other.
	const uids = (text: string) =>
		text
			.split('\r\n')
			.filter((l) => l.startsWith('UID:'))
			.map((l) => l.slice(4));

	expect(uids(myFeed).length).toBeGreaterThan(0);
	expect(uids(theirFeed).length).toBeGreaterThan(0);
	for (const uid of uids(myFeed)) expect(uids(theirFeed)).not.toContain(uid);

	await mine.request.dispose();
	await theirs.request.dispose();
});
