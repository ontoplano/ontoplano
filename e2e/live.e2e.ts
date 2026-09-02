import { expect, test, type APIRequestContext } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A page that keeps itself current while something else writes.
 *
 * The failure this prevents is silent, which is why it is worth an end-to-end
 * test rather than a unit one: an assistant writes to the account, the write
 * succeeds, and the tab in front of the person goes on showing what was true
 * before they asked. Nothing errors and nothing is logged — the screen is just
 * wrong, and stays wrong until somebody reloads by hand.
 *
 * So this drives the whole path: a real browser holding a real stream, a token
 * writing over real HTTP the way an assistant does, and the assertion is that
 * the page changed without anybody touching it.
 */
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4173';

async function mint(request: APIRequestContext, cookie: string, scopes: string[]) {
	const form = new URLSearchParams();
	form.set('label', 'live test');
	for (const scope of scopes) form.append('scopes', scope);

	const res = await request.post('/settings/integrations?/createToken', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: form.toString()
	});
	const token = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(token, 'no token came back').toBeTruthy();
	return token!;
}

test('a todo added by an assistant turns up without a reload', async ({ page, playwright }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, `live-${Date.now()}@test.invalid`);

	// The token, made the way the integrations page makes one.
	const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const token = await mint(request, cookie, ['tasks:write', 'tasks:read']);

	await visit(page, '/planner/todo');
	const title = `written by an assistant ${Date.now()}`;
	await expect(page.getByText(title)).toHaveCount(0);

	// Nothing touches the browser from here on.
	const wrote = await request.post('/api/mcp', {
		headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		data: {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title } }
		}
	});
	expect(wrote.ok(), await wrote.text()).toBe(true);

	// The page hears, reloads its own loaders, and the row appears.
	await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });

	await request.dispose();
});

test('a stream is refused to somebody who is not signed in', async ({ playwright }) => {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const answer = await request.get('/api/live', { headers: { Cookie: '' } });
	expect(answer.status()).toBe(401);
	await request.dispose();
});
