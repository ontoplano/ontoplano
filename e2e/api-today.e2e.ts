import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';

/**
 * The widget's endpoint, and the scope that guards it.
 *
 * `/api/v1/today` exists so a home-screen widget can draw a day in one request.
 * The point of giving it its own scope is that the token lives on a phone: a
 * widget must be able to read today without also being able to read a week
 * ahead, and neither should reach anything else.
 */

const ORIGIN = 'http://localhost:4173';

async function account(playwright: PlaywrightWorkerArgs['playwright']) {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `widget-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN },
		data: { email, password: 'hunter2hunter2', name: 'Widget' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	// A new account meets first run before anything else answers.
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

async function mintToken(
	request: APIRequestContext,
	cookie: string,
	scopes: string
): Promise<string> {
	const res = await request.post('/settings/integrations?/createToken', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { name: `token ${scopes}`, scopes }
	});

	const token = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(token, `no token in the response for ${scopes}`).toBeTruthy();
	return token!;
}

test('today is refused without a token, and with the wrong scope', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);

	const anonymous = await request.get('/api/v1/today', { headers: { Cookie: '' } });
	expect(anonymous.status()).toBe(401);

	const alarms = await mintToken(request, cookie, 'schedule:read');
	const wrongScope = await request.get('/api/v1/today', {
		headers: { Authorization: `Bearer ${alarms}`, Cookie: '' }
	});
	expect(wrongScope.status()).toBe(403);

	await request.dispose();
});

test('today answers with blocks, habits and tasks in one request', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);
	const action = { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' };

	await request.post('/health/habits?/create', {
		headers: action,
		form: { name: 'drink water', type: 'good', scheduledDays: '' }
	});

	const token = await mintToken(request, cookie, 'today:read');
	const first = await request.get('/api/v1/today', {
		headers: { Authorization: `Bearer ${token}`, Cookie: '' }
	});

	expect(first.status()).toBe(200);
	const body = await first.json();

	expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	expect(body.timezone).toBe('America/Sao_Paulo');
	// The starter week puts blocks on every weekday, so this is only ever
	// empty on a Saturday or Sunday — the habit is the part that must be there.
	expect(Array.isArray(body.blocks)).toBe(true);
	expect(body.habits).toContainEqual(expect.objectContaining({ name: 'drink water', done: false }));

	// A todo belongs to the day it was pulled onto, which is what the widget
	// draws: an undated one is not "today" yet.
	await request.post('/planner/todo?/create', {
		headers: action,
		form: { title: 'book the plumber', scheduledDate: body.date }
	});

	const second = await (
		await request.get('/api/v1/today', {
			headers: { Authorization: `Bearer ${token}`, Cookie: '' }
		})
	).json();

	expect(second.tasks).toContainEqual(
		expect.objectContaining({ title: 'book the plumber', overdue: false })
	);

	await request.dispose();
});
