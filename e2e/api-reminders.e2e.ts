import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PASSWORD, clientAddress } from './helpers/account';

/**
 * What a phone reads to ring for an instance it is not part of.
 *
 * The app cannot be woken by a server it is pointed at: Android's web view has
 * no Push API, and the shell's plugins reach the copy of the app it carries
 * and no further. So the phone asks instead, and books Android's own alarms
 * with the answer — which makes this endpoint the alarm clock's half of the
 * arrangement.
 *
 * Its own scope, for the same reason `today:read` has one: the token lives on
 * a phone somebody can lose, so it reads the alarms about to go off and not
 * the calendar they hang from.
 */

const ORIGIN = 'http://localhost:4173';

async function account(playwright: PlaywrightWorkerArgs['playwright']) {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `alarm-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: PASSWORD, name: 'Alarm' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	await request.post('/welcome?/finish', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { timezone: 'America/Sao_Paulo', firstDay: '0', generateDay: '6', template: 'remote' }
	});

	return { request, cookie };
}

async function mintToken(
	request: APIRequestContext,
	cookie: string,
	scopes: string | string[]
): Promise<string> {
	const wanted = Array.isArray(scopes) ? scopes : [scopes];
	const form = new URLSearchParams();
	form.set('label', `token ${wanted.join(' ')}`);
	for (const scope of wanted) form.append('scopes', scope);

	const res = await request.post('/settings/integrations/connections?/createToken', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: form.toString()
	});

	const token = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(token, `no token in the response for ${scopes}`).toBeTruthy();
	return token!;
}

/** A day ahead, as the reminder form writes one. */
function tomorrow(): { day: string; time: string } {
	const at = new Date(Date.now() + 24 * 60 * 60 * 1000);
	return { day: at.toISOString().slice(0, 10), time: '09:30' };
}

test('upcoming reminders are refused without a token, and with the wrong scope', async ({
	playwright
}) => {
	const { request, cookie } = await account(playwright);

	const anonymous = await request.get('/api/v1/reminders/upcoming', { headers: { Cookie: '' } });
	expect(anonymous.status()).toBe(401);

	// The scope that reads the plan is not the scope that reads the alarms: a
	// phone that can ring must not thereby hold a copy of the week.
	const plan = await mintToken(request, cookie, 'schedule:read');
	const wrongScope = await request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${plan}`, Cookie: '' }
	});
	expect(wrongScope.status()).toBe(403);

	await request.dispose();
});

test('it answers with what has not gone off yet, in the shape an alarm takes', async ({
	playwright
}) => {
	const { request, cookie } = await account(playwright);
	const { day, time } = tomorrow();

	const made = await request.post('/reminders?/create', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { day, time, label: 'take the bread out', audible: 'on' }
	});
	expect(made.ok(), await made.text()).toBeTruthy();

	const key = await mintToken(request, cookie, 'reminders:read');
	const answer = await request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${key}`, Cookie: '' }
	});
	expect(answer.status()).toBe(200);

	const { upcoming } = (await answer.json()) as {
		upcoming: { id: number; remindAt: string; message: string; audible: boolean }[];
	};
	const mine = upcoming.find((r) => r.message === 'take the bread out');

	expect(mine, JSON.stringify(upcoming)).toBeTruthy();
	// Everything the booking side needs and nothing else: when, what to say,
	// whether it makes a noise, and the id that lets the alarm be cancelled.
	expect(Object.keys(mine!).sort()).toEqual(['audible', 'id', 'message', 'remindAt']);
	expect(mine!.audible).toBe(true);
	expect(new Date(mine!.remindAt).getTime()).toBeGreaterThan(Date.now());

	await request.dispose();
});

test("one account's alarms are never another's", async ({ playwright }) => {
	const mine = await account(playwright);
	const theirs = await account(playwright);
	const { day, time } = tomorrow();

	await mine.request.post('/reminders?/create', {
		headers: { Origin: ORIGIN, Cookie: mine.cookie, 'x-sveltekit-action': 'true' },
		form: { day, time, label: 'a private alarm', audible: 'on' }
	});

	const key = await mintToken(theirs.request, theirs.cookie, 'reminders:read');
	const answer = await theirs.request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${key}`, Cookie: '' }
	});

	expect(answer.status()).toBe(200);
	expect(await answer.text()).not.toContain('a private alarm');

	await mine.request.dispose();
	await theirs.request.dispose();
});
