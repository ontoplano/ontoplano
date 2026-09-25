import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Connecting an assistant by pressing a button, with no key in anybody's hands.
 *
 * The whole point of the flow is that it has no steps a person can get wrong,
 * so what this walks is every step: the client registers itself, the person
 * says yes on a screen of ours, the code goes home to an address the client
 * registered, and what comes back is a key that works on `/api/mcp`.
 *
 * Three refusals ride along, because each is a way somebody else ends up
 * holding a key to this account: a code cannot be spent twice, cannot be spent
 * without the verifier it was issued against, and an address nobody registered
 * is refused before the screen is ever drawn.
 */
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

const CALLBACK_PATH = '/callback';

/** A desktop client listens on its own machine for the code. So does this. */
function callbackListener() {
	let landed = '';
	let baseURL = '';
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', baseURL);
		if (url.pathname === CALLBACK_PATH) landed = url.href;
		res.end('connected');
	});
	return {
		start: async () => {
			await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('callback listener has no port');
			baseURL = `http://127.0.0.1:${address.port}`;
			return `${baseURL}${CALLBACK_PATH}`;
		},
		stop: () => new Promise<void>((done) => server.close(() => done())),
		seen: () => landed
	};
}

test('an assistant connects itself, and the key it gets works', async ({ page, request }) => {
	test.setTimeout(120_000);
	const listener = callbackListener();
	const redirect = await listener.start();

	try {
		await register(page, testEmail('oauth'));

		// 1. The client introduces itself. Nobody has signed in as far as it knows.
		const registered = await request.post('/oauth/register', {
			data: { client_name: 'Claude', redirect_uris: [redirect] }
		});
		expect(registered.status()).toBe(201);
		const client = await registered.json();
		expect(client.client_id).toBeTruthy();

		const ask =
			`/oauth/authorize?response_type=code&client_id=${client.client_id}` +
			`&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}` +
			`&code_challenge_method=S256&state=said-so`;

		// 2. The consent screen says who is asking and what they would get.
		await visit(page, ask);
		await expect(page.getByText('Claude wants to connect to your ontoplano.')).toBeVisible();
		await expect(page.getByText('It would be able to')).toBeVisible();
		// Deleting is offered and not taken.
		await expect(page.getByRole('checkbox', { name: /delete things/i })).not.toBeChecked();
		// Everything else is ticked, and can be untaken: the whole of an area
		// goes with its heading, and one line goes on its own.
		const workouts = page.getByRole('checkbox', { name: /Habits and workouts/ });
		await expect(workouts).toBeChecked();
		await workouts.uncheck();
		await page.getByRole('checkbox', { name: /See your ideas/ }).uncheck();

		// 3. Yes — and the code goes home to the address it registered.
		await page.getByRole('button', { name: 'Connect it' }).click();
		await expect.poll(() => listener.seen(), { timeout: 30_000 }).toContain('code=');
		// The browser may ask the callback origin for an icon after arriving.
		// That request must not replace the code the client came to receive.
		await request.get(new URL('/favicon.ico', redirect).href);

		const came = new URL(listener.seen());
		expect(came.pathname).toBe(CALLBACK_PATH);
		expect(came.searchParams.has('code')).toBe(true);
		const code = came.searchParams.get('code') ?? '';
		expect(came.searchParams.get('state')).toBe('said-so');

		// 4. A code alone opens nothing: PKCE is what proves it is the same client.
		const stolen = await request.post('/oauth/token', {
			form: {
				grant_type: 'authorization_code',
				code,
				client_id: client.client_id,
				redirect_uri: redirect,
				code_verifier: randomBytes(32).toString('base64url')
			}
		});
		expect(stolen.status()).toBe(400);
		expect((await stolen.json()).error).toBe('invalid_grant');

		// 5. The client swaps its code for a key.
		const swapped = await request.post('/oauth/token', {
			form: {
				grant_type: 'authorization_code',
				code,
				client_id: client.client_id,
				redirect_uri: redirect,
				code_verifier: verifier
			}
		});
		expect(swapped.status(), await swapped.text()).toBe(200);
		const token = await swapped.json();
		expect(token.token_type).toBe('Bearer');
		expect(token.access_token).toMatch(/^onto_/);
		// Everything an assistant does, and not deleting — nobody ticked it.
		expect(token.scope).toContain('tasks:write');
		expect(token.scope).not.toContain('destructive');
		// Nor the two that were untaken on the screen: the heading took its
		// whole area with it, and the line took itself.
		expect(token.scope).not.toContain('habits:');
		expect(token.scope).not.toContain('workouts:');
		expect(token.scope).not.toContain('ideas:read');
		expect(token.scope).toContain('ideas:write');

		// 6. And the key works where it was minted to work.
		const called = await request.post('/api/mcp', {
			headers: { authorization: `Bearer ${token.access_token}` },
			data: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
		});
		expect(called.status()).toBe(200);
		expect((await called.json()).result.tools.length).toBeGreaterThan(10);

		// 7. The same code, a second time, by whoever else has a copy of it.
		const again = await request.post('/oauth/token', {
			form: {
				grant_type: 'authorization_code',
				code,
				client_id: client.client_id,
				redirect_uri: redirect,
				code_verifier: verifier
			}
		});
		expect(again.status()).toBe(400);

		// 8. It stands in the keys list, revocable like any other.
		await visit(page, '/settings/integrations/connections');
		await expect(page.getByText('Claude', { exact: false }).first()).toBeVisible();
	} finally {
		await listener.stop();
	}
});

test('an address the client never registered is refused before anything is drawn', async ({
	page,
	request
}) => {
	test.setTimeout(120_000);
	await register(page, testEmail('oauth-bad'));

	const registered = await request.post('/oauth/register', {
		data: { client_name: 'Claude', redirect_uris: ['https://claude.ai/callback'] }
	});
	const client = await registered.json();

	// The one thing that must never be honoured: a code sent somewhere the
	// client never vouched for.
	await page.goto(
		`/oauth/authorize?response_type=code&client_id=${client.client_id}` +
			`&redirect_uri=${encodeURIComponent('https://somewhere-else.test/steal')}` +
			`&code_challenge=${challenge}&code_challenge_method=S256`
	);
	await expect(page.getByText('never registered')).toBeVisible();
});

test('the discovery documents say where to knock', async ({ request }) => {
	const resource = await request.get('/.well-known/oauth-protected-resource');
	expect(resource.status()).toBe(200);
	const described = await resource.json();
	expect(described.resource).toContain('/api/mcp');

	const server = await request.get('/.well-known/oauth-authorization-server');
	const metadata = await server.json();
	expect(metadata.authorization_endpoint).toContain('/oauth/authorize');
	expect(metadata.code_challenge_methods_supported).toEqual(['S256']);

	// And an unauthenticated call points at the first of those documents.
	const refused = await request.post('/api/mcp', {
		data: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
	});
	expect(refused.status()).toBe(401);
	expect(refused.headers()['www-authenticate']).toContain('oauth-protected-resource');
});

/**
 * The CSRF check moved into `handleCsrf`, and the exemption is one path.
 *
 * Worth pinning rather than trusting: what was given up to let a program post
 * a form with no `Origin` header is the framework's blanket refusal, and the
 * whole of what replaced it is that hook. A second exempt path added by
 * accident would be a forgeable form action, which is the one thing the
 * original check existed to prevent.
 */
test('only the token endpoint takes a form post from somewhere else', async ({ request }) => {
	const elsewhere = 'https://not-this-instance.test';

	// An ordinary action, posted from another origin: refused, as before.
	const forged = await request.post('/settings/preferences?/saveWeek', {
		headers: { origin: elsewhere },
		form: { firstDay: '0', generateDay: '6' }
	});
	expect(forged.status()).toBe(403);
	expect(await forged.text()).toContain('forbidden');

	// The login form too, which is the one a forgery would most like to reach.
	const forgedSignIn = await request.post('/login?/signIn', {
		headers: { origin: elsewhere },
		form: { email: 'nobody@example.test', password: 'whatever-1234' }
	});
	expect(forgedSignIn.status()).toBe(403);

	/*
	 * The token endpoint is the exemption, and it is not a hole: it reads no
	 * cookie, so there is no session for a forged post to spend. What it
	 * refuses here is the request on its own terms — no code, no grant.
	 */
	const token = await request.post('/oauth/token', {
		headers: { origin: elsewhere },
		form: {
			grant_type: 'authorization_code',
			code: 'not-a-real-code',
			client_id: 'nobody',
			redirect_uri: 'https://claude.ai/callback',
			code_verifier: 'x'.repeat(43)
		}
	});
	expect(token.status()).not.toBe(403);
	expect(token.status()).toBe(401);
	expect((await token.json()).error).toBe('invalid_client');
});
