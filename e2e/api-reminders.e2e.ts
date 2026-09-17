import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PASSWORD, clientAddress, testEmail } from './helpers/account';

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
	const email = testEmail('alarm');

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
	expect(Object.keys(mine!).sort()).toEqual(['at', 'audible', 'id', 'message', 'remindAt']);
	expect(mine!.audible).toBe(true);

	/*
	 * Two spellings of when, and the difference is the whole point.
	 *
	 * `remindAt` is the account's wall clock, for showing. `at` is the moment,
	 * with an offset on it, because an alarm is set to a moment — the shell's
	 * ringer read the wall clock as an instant, got nothing it could parse,
	 * and skipped every reminder a phone was ever handed.
	 */
	expect(mine!.remindAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
	expect(mine!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	expect(new Date(mine!.at).getTime()).toBeGreaterThan(Date.now());

	await request.dispose();
});

/**
 * The key the phone actually holds, made the way the phone makes it.
 *
 * `ringOnThisPhone` is the action behind the launch handshake and the one
 * press on Preferences. Two promises hang off it and both are the kind that
 * only breaks in production: the key is the narrowest one the app issues, and
 * setting a phone up again replaces the key rather than adding one — so a
 * phone somebody no longer has stops working instead of keeping a way in.
 */
async function mintRingerKey(request: APIRequestContext, cookie: string): Promise<string> {
	const res = await request.post('/settings/integrations?/ringOnThisPhone', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		// The action takes nothing: which phone is asking is not something a
		// request can be trusted to say, and the session says whose alarms.
		data: ''
	});
	expect(res.ok(), await res.text()).toBeTruthy();
	const key = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(key, 'no key in the action’s answer').toBeTruthy();
	return key!;
}

test('setting the phone up again replaces the key, and the old one stops working', async ({
	playwright
}) => {
	const { request, cookie } = await account(playwright);

	const first = await mintRingerKey(request, cookie);
	const heard = await request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${first}`, Cookie: '' }
	});
	expect(heard.status()).toBe(200);

	// The same phone, set up again — or a new phone, after the old one was
	// lost. Either way the first key has to die with the second's making.
	const second = await mintRingerKey(request, cookie);
	expect(second).not.toBe(first);

	const lostPhone = await request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${first}`, Cookie: '' }
	});
	expect(lostPhone.status()).toBe(401);

	const thisPhone = await request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${second}`, Cookie: '' }
	});
	expect(thisPhone.status()).toBe(200);

	await request.dispose();
});

test('the phone’s key reads the alarms and not the calendar they hang from', async ({
	playwright
}) => {
	const { request, cookie } = await account(playwright);
	const key = await mintRingerKey(request, cookie);

	// The claim on the tin: `reminders:read` and nothing else. A phone that
	// can ring must not thereby hold a copy of the week — the other half of
	// the scope test above, from the key the phone actually gets.
	const week = await request.get('/api/v1/schedule/upcoming', {
		headers: { Authorization: `Bearer ${key}`, Cookie: '' }
	});
	expect(week.status()).toBe(403);

	const alarms = await request.get('/api/v1/reminders/upcoming', {
		headers: { Authorization: `Bearer ${key}`, Cookie: '' }
	});
	expect(alarms.status()).toBe(200);

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
