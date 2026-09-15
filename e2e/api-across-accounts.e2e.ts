import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PASSWORD, clientAddress } from './helpers/account';

/**
 * Somebody else's id, at every door of the REST API that takes one.
 *
 * The assistant's surface got this treatment: seventy tools, swept with a
 * stranger's ids, twice — once for what they read and once for what they
 * wrote. The API is the same services behind a different door, and what has
 * kept it honest is the same habit: each service filters by account in every
 * query it writes. A habit is exactly the thing worth a test.
 *
 * So this makes one account's things, hands the ids to another account with
 * the right scopes, and asks the two questions that matter: did anything
 * change, and did the answer contain anything of the first account's. A
 * refusal for the wrong reason — a bad shape, a missing field — still passes,
 * because it did not touch the row either.
 */

const ORIGIN = 'http://localhost:4173';

type Account = { request: APIRequestContext; cookie: string };

async function account(
	playwright: PlaywrightWorkerArgs['playwright'],
	who: string
): Promise<Account> {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: PASSWORD, name: who }
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

async function keyFor(who: Account, scopes: string[]): Promise<string> {
	const form = new URLSearchParams();
	// Sixty characters is the cap; five scope names are not.
	form.set('label', 'sweep');
	for (const scope of scopes) form.append('scopes', scope);

	const res = await who.request.post('/settings/integrations/connections?/createToken', {
		headers: {
			Origin: ORIGIN,
			Cookie: who.cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: form.toString()
	});
	const body = await res.text();
	const token = /onto_[A-Za-z0-9_-]+/.exec(body)?.[0];
	expect(token, `no token for ${scopes}: ${res.status()} ${body.slice(0, 300)}`).toBeTruthy();
	return token!;
}

const SCOPES = [
	'shopping:read',
	'shopping:write',
	'streams:read',
	'streams:write',
	'webhooks:manage'
];

test('no account reaches another one through the API', async ({ playwright }) => {
	const mine = await account(playwright, 'owner');
	const theirs = await account(playwright, 'stranger');

	const myKey = await keyFor(mine, SCOPES);
	const theirKey = await keyFor(theirs, SCOPES);
	const asThem = { Authorization: `Bearer ${theirKey}`, Cookie: '' };
	const asMe = { Authorization: `Bearer ${myKey}`, Cookie: '' };

	// ── One of each thing that has an id, belonging to the first account ──────
	const item = await mine.request.post('/api/v1/shopping/items', {
		headers: { ...asMe, 'content-type': 'application/json' },
		data: { name: 'a private loaf' }
	});
	expect(item.ok(), await item.text()).toBeTruthy();

	// The POST answers whether the list already had one, not an id, so the id
	// comes from the list — which is also the read this sweep checks later.
	const listed = await mine.request.get('/api/v1/shopping', { headers: asMe });
	const items = ((await listed.json()) as { items: { id: number; name: string }[] }).items;
	const itemId = items.find((one) => one.name === 'a private loaf')?.id;
	expect(itemId, JSON.stringify(items)).toBeTruthy();

	const stream = await mine.request.post('/api/v1/streams', {
		headers: { ...asMe, 'content-type': 'application/json' },
		data: {
			slug: `private-${Date.now()}`,
			name: 'Private readings',
			unit: 'kg',
			kind: 'measurement',
			// A stream says where its numbers come from; the sweep is one producer.
			source: 'sweep'
		}
	});
	expect(stream.ok(), await stream.text()).toBeTruthy();
	const slug = ((await stream.json()) as { slug: string }).slug;
	expect(slug, 'no slug came back').toBeTruthy();

	const hook = await mine.request.post('/api/v1/webhooks', {
		headers: { ...asMe, 'content-type': 'application/json' },
		data: { url: 'https://example.com/hook', events: ['todo.completed'] }
	});
	expect(hook.ok(), await hook.text()).toBeTruthy();
	const hookId = ((await hook.json()) as { id: number }).id;
	expect(hookId, 'no webhook id came back').toBeTruthy();

	// ── The stranger, holding every scope, naming all three ───────────────────
	const attempts: { what: string; res: import('@playwright/test').APIResponse }[] = [
		{
			what: 'tick somebody else’s shopping item',
			res: await theirs.request.post(`/api/v1/shopping/items/${itemId}/bought`, {
				headers: { ...asThem, 'content-type': 'application/json' },
				data: { bought: true }
			})
		},
		{
			what: 'read somebody else’s stream',
			res: await theirs.request.get(`/api/v1/streams/${slug}/points`, { headers: asThem })
		},
		{
			what: 'write into somebody else’s stream',
			res: await theirs.request.post(`/api/v1/streams/${slug}/points`, {
				headers: { ...asThem, 'content-type': 'application/json' },
				data: { points: [{ at: new Date().toISOString(), value: 1 }] }
			})
		},
		{
			what: 'delete somebody else’s webhook',
			res: await theirs.request.delete(`/api/v1/webhooks/${hookId}`, { headers: asThem })
		}
	];

	for (const { what, res } of attempts) {
		expect(res.status(), `${what} was answered with ${res.status()}`).toBeGreaterThanOrEqual(400);
		expect(await res.text(), `${what} disclosed something`).not.toContain('private');
	}

	// ── And the first account's things are exactly as they were ───────────────
	const shopping = await mine.request.get('/api/v1/shopping', { headers: asMe });
	const loaf = ((await shopping.json()) as { items: { id: number; bought: boolean }[] }).items.find(
		(one) => one.id === itemId
	);
	expect(loaf?.bought, 'the stranger ticked it').toBeFalsy();

	const points = await mine.request.get(`/api/v1/streams/${slug}/points`, { headers: asMe });
	expect(
		((await points.json()) as { points: unknown[] }).points,
		'the stranger wrote into it'
	).toHaveLength(0);

	const hooks = await mine.request.get('/api/v1/webhooks', { headers: asMe });
	expect(await hooks.text(), 'the stranger deleted it').toContain('example.com/hook');

	await mine.request.dispose();
	await theirs.request.dispose();
});
