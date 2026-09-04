import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { clientAddress, register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * An AI assistant, from the outside: a real token over real HTTP.
 *
 * `tests/mcp.test.ts` holds the protocol to its contract with the message
 * handler in front of it. This one is the other question — whether a client
 * that has nothing but an address and a bearer token can actually get work
 * done — and it is the one that catches an endpoint wired up wrong, an auth
 * header read from the wrong place, or a scope that never reaches the tools.
 */
const ORIGIN = 'http://localhost:4173';

async function account(playwright: PlaywrightWorkerArgs['playwright']) {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `mcp-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: 'hunter2hunter2', name: 'Assistant' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	await request.post('/welcome', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { timezone: 'America/Sao_Paulo', firstDay: '0', generateDay: '6', template: 'remote' }
	});

	return { request, cookie };
}

/**
 * A token holding several scopes.
 *
 * The form sends one `scopes` field per ticked box and the action reads them
 * with `getAll`, so the body is built by hand: Playwright's `form:` option
 * takes one value per name, and a comma-joined string arrives as a single
 * scope nobody has ever granted.
 */
async function mintToken(request: APIRequestContext, cookie: string, scopes: string[]) {
	const body = new URLSearchParams();
	body.set('label', `mcp ${scopes.join(' ')}`);
	for (const scope of scopes) body.append('scopes', scope);

	const res = await request.post('/settings/integrations?/createToken', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: body.toString()
	});
	const said = await res.text();
	const token = /onto_[A-Za-z0-9_-]+/.exec(said)?.[0];
	expect(token, `no token for ${scopes.join(',')}: ${said.slice(0, 200)}`).toBeTruthy();
	return token!;
}

/** One JSON-RPC message, the way a client sends it. */
async function rpc(
	request: APIRequestContext,
	token: string,
	message: Record<string, unknown>
): Promise<{ status: number; body: Record<string, never> }> {
	const res = await request.post('/api/mcp', {
		headers: { Authorization: `Bearer ${token}`, Cookie: '', 'content-type': 'application/json' },
		data: message
	});
	const status = res.status();
	if (status === 202) return { status, body: {} as Record<string, never> };
	return { status, body: await res.json() };
}

test('an AI assistant introduces itself, is offered what its token holds, and does the work', async ({
	playwright
}) => {
	const { request, cookie } = await account(playwright);
	const token = await mintToken(request, cookie, [
		'today:read',
		'tasks:read',
		'tasks:write',
		'search:read'
	]);

	// ── The handshake ────────────────────────────────────────────────────────
	const init = await rpc(request, token, {
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params: {
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'playwright', version: '1' }
		}
	});
	expect(init.status).toBe(200);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const hello = init.body as any;
	expect(hello.result.serverInfo.name).toBe('ontoplano');
	expect(hello.result.capabilities.tools).toBeTruthy();

	// A notification is answered with nothing at all, which is the protocol's
	// rule: a client waiting for a reply to one waits forever.
	expect(
		(await rpc(request, token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status
	).toBe(202);

	// ── What it may do ───────────────────────────────────────────────────────
	const list = await rpc(request, token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const names = (list.body as any).result.tools.map((t: { name: string }) => t.name);
	expect(names).toContain('today');
	expect(names).toContain('add_todo');
	// Not granted, so not offered.
	expect(names).not.toContain('write_entry');

	// ── And the work ─────────────────────────────────────────────────────────
	const added = await rpc(request, token, {
		jsonrpc: '2.0',
		id: 3,
		method: 'tools/call',
		params: { name: 'add_todo', arguments: { title: 'Ring the dentist' } }
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	expect((added.body as any).result.isError).toBe(false);

	const found = await rpc(request, token, {
		jsonrpc: '2.0',
		id: 4,
		method: 'tools/call',
		params: { name: 'search', arguments: { query: 'dentist' } }
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const hits = JSON.stringify((found.body as any).result.structuredContent);
	expect(hits).toContain('Ring the dentist');

	await request.dispose();
});

test('a tool the token was never offered is refused by name', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);
	// Reading only. Naming a writing tool anyway is one line of JSON, which is
	// exactly why the scope is checked on the call and not only on the listing.
	const token = await mintToken(request, cookie, ['today:read']);

	const answer = await rpc(request, token, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: 'add_todo', arguments: { title: 'should not happen' } }
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = (answer.body as any).result;
	expect(result.isError).toBe(true);
	expect(result.content[0].text).toContain('tasks:write');

	await request.dispose();
});

test('the address says nothing to somebody without a token', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	const anonymous = await request.post('/api/mcp', {
		headers: { 'content-type': 'application/json' },
		data: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
	});
	expect(anonymous.status()).toBe(401);

	const nonsense = await request.post('/api/mcp', {
		headers: {
			Authorization: 'Bearer onto_definitely-not-a-token',
			'content-type': 'application/json'
		},
		data: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
	});
	expect(nonsense.status()).toBe(401);

	// A GET is how a client asks for a server-initiated stream. There is not
	// one, and saying so is better than holding a connection open forever.
	expect((await request.get('/api/mcp')).status()).toBe(405);

	await request.dispose();
});

/**
 * The preset, in the browser, because the button is the thing being tested.
 *
 * Eighteen checkboxes is a form somebody ticks wrong, and both wrong answers
 * cost something: a token that cannot do its job, or one that can do more than
 * it was made for. The set is derived from the tools, so this also fails the
 * day a tool is added with a scope the preset does not cover.
 */
test('the preset ticks exactly the scopes an AI assistant needs', async ({ page }) => {
	await register(page, `preset-${Date.now()}@test.invalid`);
	await visit(page, '/settings/integrations');

	await page
		.getByRole('button', { name: /new token/i })
		.first()
		.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	await dialog.getByRole('button', { name: /an ai assistant/i }).click();

	const ticked = await dialog
		.locator('input[name="scopes"]:checked')
		.evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value).sort());

	// Every writing scope an AI assistant uses, and no calendar link — that one
	// cannot be combined with anything and would make the token unusable.
	expect(ticked).toContain('tasks:write');
	expect(ticked).toContain('notes:write');
	expect(ticked).toContain('today:read');
	// Including habits, which the widget's token does not get: an assistant
	// asked "did I keep my habits this week" is a use somebody grants on
	// purpose, and the preset is the set of grants the tools actually need.
	expect(ticked).toContain('habits:read');
	expect(ticked).not.toContain('calendar:read');
	expect(ticked).not.toContain('streams:write');

	// Pressing it twice leaves the form in the state the label claims, rather
	// than accumulating.
	await dialog.getByRole('button', { name: /an ai assistant/i }).click();
	const again = await dialog
		.locator('input[name="scopes"]:checked')
		.evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value).sort());
	expect(again).toEqual(ticked);

	// And Clear means clear.
	await dialog.getByRole('button', { name: /^clear$/i }).click();
	expect(await dialog.locator('input[name="scopes"]:checked').count()).toBe(0);
});

/**
 * Tidying a shopping list, which is what an assistant is actually asked to do.
 *
 * The surface could add, tick and delete — and nothing else. So an assistant
 * asked to bring an item back out of the cupboard had one move available:
 * delete the row and make a new one, losing its category, its notes and every
 * price ever recorded against it. This walks the round trip over real HTTP, the
 * way the thing that reported it does.
 */
test('an assistant can undo everything it can do to a shopping list', async ({ playwright }) => {
	const { request, cookie } = await account(playwright);
	const token = await mintToken(request, cookie, ['shopping:read', 'shopping:write']);

	const call = async (name: string, args: Record<string, unknown>) => {
		const res = await rpc(request, token, {
			jsonrpc: '2.0',
			id: 9,
			method: 'tools/call',
			params: { name, arguments: args }
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const body = res.body as any;
		expect(body.result?.isError, `${name}: ${body.result?.content?.[0]?.text}`).toBe(false);
		return body.result.structuredContent;
	};

	const list = async () => (await call('shopping_list', {})).items as Record<string, unknown>[];
	const find = async (name: string) => (await list()).find((i) => i.name === name);

	await call('add_to_shopping_list', { name: 'Cebola' });
	expect((await find('Cebola'))?.bought, 'a new item starts on the list').toBe(false);

	// Into the cupboard…
	const onion = await find('Cebola');
	await call('tick_bought', { id: onion!.id });
	expect((await find('Cebola'))?.bought).toBe(true);

	// …and back out again, which is the whole point.
	await call('untick_bought', { id: onion!.id });
	expect((await find('Cebola'))?.bought, 'it could not be brought back').toBe(false);

	// Aside for now, and back.
	await call('snooze_item', { id: onion!.id });
	expect((await find('Cebola'))?.snoozed).toBe(true);
	await call('unsnooze_item', { id: onion!.id });
	expect((await find('Cebola'))?.snoozed, 'it could not be woken').toBe(false);

	// And the row is the same row throughout — not a replacement, which is what
	// delete-and-recreate would have left behind.
	expect((await find('Cebola'))?.id).toBe(onion!.id);

	await request.dispose();
});
