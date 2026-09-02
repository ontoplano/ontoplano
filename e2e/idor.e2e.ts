import { expect, test, type APIRequestContext } from '@playwright/test';
import { clientAddress } from './helpers/account';

/**
 * The IDOR suite.
 *
 * Two accounts. A creates one of everything; B then asks for each of A's rows
 * by id and must be told the same thing it would be told about a row that does
 * not exist — same status, same message. Anything else leaks whether the row
 * is there, which is the half of the vulnerability people forget.
 *
 * This is the durable guarantee behind invariant I1: ownership lives in the
 * `WHERE` of the statement, not in a check above it. Every entity gets a case;
 * a new entity without one here is not finished.
 */

const ORIGIN = 'http://localhost:4173';

type Account = { email: string; cookie: string };

async function register(request: APIRequestContext, email: string): Promise<Account> {
	const res = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: 'hunter2hunter2', name: email.split('@')[0] }
	});
	expect(res.ok(), `registering ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();

	const cookie = (
		res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();
	expect(cookie, 'session cookie').toContain('better-auth');

	// A new account lands on first run, and every other page redirects there
	// until it is done. Take the blank week: the tests bring their own rows.
	const welcome = await request.post('/welcome', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		form: { timezone: 'UTC', firstDay: '0', generateDay: '6', template: 'blank' }
	});
	expect(welcome.ok(), `first run for ${email}`).toBeTruthy();

	return { email, cookie };
}

/** Post to a form action the way the browser does, and decode the result. */
async function action(
	request: APIRequestContext,
	who: Account,
	path: string,
	form: Record<string, string>
) {
	const res = await request.post(path, {
		headers: {
			Origin: ORIGIN,
			Cookie: who.cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		form
	});

	const body = await res.json();
	const data = body.data ? JSON.parse(body.data) : null;
	// SvelteKit's action responses are index-encoded: the first entry maps keys
	// to positions in the same array.
	const shape = Array.isArray(data) ? data[0] : null;
	const message =
		shape && typeof shape === 'object' && 'message' in shape ? data[shape.message] : undefined;

	return { status: body.status as number, type: body.type as string, message };
}

/**
 * The id of the row a page's load function just produced, read out of the
 * serialised payload.
 *
 * The dev server writes `ideas:[{id:1`, a production build writes the same
 * thing inside an escaped `JSON.parse("…")`; unescaping first makes one pattern
 * match both.
 */
async function firstId(request: APIRequestContext, who: Account, path: string, key: string) {
	const res = await request.get(path, { headers: { Cookie: who.cookie } });
	const payload = (await res.text()).replace(/\\"/g, '"');
	const match = payload.match(new RegExp(`"?${key}"?:\\[\\{"?id"?:(\\d+)`));
	expect(match, `finding an id for ${key} on ${path}`).not.toBeNull();
	return match![1];
}

// One worker for the file: the two accounts are registered once, and the auth
// rate limiter would otherwise answer 429 to a second worker's sign-ups.
test.describe.configure({ mode: 'serial' });

test.describe('one account cannot reach another account by id', () => {
	let alice: Account;
	let mallory: Account;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext({ baseURL: ORIGIN });
		const stamp = Date.now();
		alice = await register(request, `alice-${stamp}@example.test`);
		mallory = await register(request, `mallory-${stamp}@example.test`);
		await request.dispose();
	});

	/**
	 * Each case creates a row as Alice, then has Mallory attempt the same
	 * mutation on it. The assertion is deliberately strict about the message:
	 * "not found" and "not yours" have to be indistinguishable.
	 */
	const cases: {
		name: string;
		page: string;
		payloadKey: string;
		create: { path: string; form: Record<string, string> };
		attack: (id: string) => { path: string; form: Record<string, string> };
	}[] = [
		{
			name: 'idea',
			page: '/ideas',
			payloadKey: 'ideas',
			create: { path: '/ideas?/create', form: { content: "alice's idea" } },
			attack: (id) => ({ path: '/ideas?/update', form: { id, content: 'taken' } })
		},
		{
			name: 'diary entry',
			page: '/diary',
			payloadKey: 'entries',
			create: { path: '/diary?/create', form: { content: "alice's entry" } },
			attack: (id) => ({ path: '/diary?/update', form: { id, content: 'taken' } })
		},
		{
			name: 'shopping item',
			page: '/shopping',
			payloadKey: 'items',
			create: {
				path: '/shopping?/create',
				form: { label: "alice's milk", type: 'replenish' }
			},
			attack: (id) => ({
				path: '/shopping?/update',
				form: { id, label: 'taken', type: 'someday' }
			})
		},
		{
			name: 'todo',
			page: '/planner/todo',
			payloadKey: 'todos',
			create: { path: '/planner/todo?/create', form: { title: "alice's todo" } },
			attack: (id) => ({ path: '/planner/todo?/update', form: { id, title: 'taken' } })
		},
		{
			name: 'habit',
			page: '/health/habits',
			payloadKey: 'habits',
			create: { path: '/health/habits?/create', form: { label: "alice's habit", type: 'good' } },
			attack: (id) => ({
				path: '/health/habits?/update',
				form: { id, label: 'taken', type: 'bad' }
			})
		},
		{
			name: 'goal',
			page: '/goals',
			payloadKey: 'goals',
			create: {
				path: '/goals?/create',
				form: { title: "alice's goal", horizon: 'week' }
			},
			attack: (id) => ({ path: '/goals?/update', form: { id, title: 'taken' } })
		},
		{
			name: 'goal area',
			page: '/goals',
			payloadKey: 'areas',
			create: { path: '/goals?/createArea', form: { label: "alice's area" } },
			attack: (id) => ({ path: '/goals?/deleteArea', form: { id } })
		},
		{
			name: 'activity',
			page: '/planner/activities',
			payloadKey: 'activities',
			create: {
				path: '/planner/activities?/create',
				form: { label: "alice's activity", categoryId: '' }
			},
			attack: (id) => ({
				path: '/planner/activities?/toggleActive',
				form: { id }
			})
		},
		{
			name: 'weekly slot',
			page: '/planner/plan',
			payloadKey: 'slots',
			create: {
				path: '/planner/plan?/create',
				form: { weekday: '1', startTime: '09:00', mode: 'category', categoryId: '' }
			},
			attack: (id) => ({ path: '/planner/plan?/delete', form: { id } })
		},
		{
			name: 'planning scheme',
			page: '/planner/plan',
			payloadKey: 'schemes',
			create: { path: '/planner/plan?/saveScheme', form: { label: "alice's scheme" } },
			attack: (id) => ({ path: '/planner/plan?/loadScheme', form: { schemeId: id } })
		},
		{
			name: 'quote',
			page: '/settings/preferences',
			payloadKey: 'quotes',
			create: { path: '/settings/preferences?/addQuote', form: { text: "alice's quote" } },
			attack: (id) => ({ path: '/settings/preferences?/deleteQuote', form: { id } })
		},
		{
			name: 'person',
			page: '/diary/people',
			payloadKey: 'people',
			create: { path: '/diary/people?/create', form: { label: "alice's friend" } },
			attack: (id) => ({ path: '/diary/people?/update', form: { id, label: 'taken' } })
		},
		{
			name: 'notebook',
			page: '/diary/notebooks',
			payloadKey: 'notebooks',
			create: { path: '/diary/notebooks?/create', form: { title: "alice's notebook" } },
			attack: (id) => ({ path: '/diary/notebooks?/update', form: { id, title: 'taken' } })
		},
		{
			name: 'api token',
			page: '/settings/integrations',
			payloadKey: 'tokens',
			create: {
				path: '/settings/integrations?/createToken',
				form: { label: "alice's token", scopes: 'schedule:read' }
			},
			attack: (id) => ({ path: '/settings/integrations?/revokeToken', form: { id } })
		},
		{
			name: 'webhook',
			page: '/settings/integrations',
			payloadKey: 'webhooks',
			create: {
				path: '/settings/integrations?/createWebhook',
				form: { url: 'https://example.com/alices-hook', events: 'todo.created' }
			},
			attack: (id) => ({ path: '/settings/integrations?/deleteWebhook', form: { id } })
		},
		{
			// The headline feature of the kitchen half, and the one entity whose
			// rows point at several others — so the ownership check has more than
			// one place to be forgotten.
			name: 'recipe',
			page: '/kitchen/recipes',
			payloadKey: 'recipes',
			create: { path: '/kitchen/recipes?/create', form: { title: "alice's recipe" } },
			attack: (id) => ({ path: '/kitchen/recipes?/update', form: { id, title: 'taken' } })
		},
		{
			// A category is what half the other entities hang off, so reaching one
			// would be reaching into everything attached to it.
			name: 'category',
			page: '/planner/activities',
			payloadKey: 'categories',
			create: {
				path: '/planner/activities?/createCategory',
				form: { label: "alice's category", color: '#1d4ed8' }
			},
			attack: (id) => ({
				path: '/planner/activities?/updateCategory',
				form: { id, label: 'taken', color: '#b91c1c' }
			})
		}
		/*
		 * Not here, and deliberately: a shopping category.
		 *
		 * There is no action that takes one by id. `saveCategories` walks the
		 * account's own list and writes each row it finds, so a form naming
		 * somebody else's id has nothing to name it *to* — the id never leaves
		 * the server. That is a stronger shape than a checked id, and a test
		 * here would be asserting against an attack that cannot be expressed.
		 */
	];

	for (const c of cases) {
		test(`${c.name}: Mallory gets the same answer as for a row that does not exist`, async ({
			playwright
		}) => {
			const request = await playwright.request.newContext({ baseURL: ORIGIN });

			// Some entities need one of Alice's categories; fill it in if the case
			// left the field blank.
			const form = { ...c.create.form };
			if ('categoryId' in form && form.categoryId === '')
				form.categoryId = await firstId(request, alice, '/planner/activities', 'categories');

			const created = await action(request, alice, c.create.path, form);
			// A create that ends in a redirect — the recipe editor opens on the new
			// row — reports `redirect` rather than `success`. Both mean it worked.
			expect(
				['success', 'redirect'],
				`Alice creating a ${c.name}: ${created.type} ${created.message ?? ''}`
			).toContain(created.type);

			const id = await firstId(request, alice, c.page, c.payloadKey);

			const stolen = await action(request, mallory, c.attack(id).path, c.attack(id).form);
			const invented = await action(
				request,
				mallory,
				c.attack('987654').path,
				c.attack('987654').form
			);

			expect(stolen.status, `${c.name}: reaching another account's row`).toBe(404);
			expect(invented.status, `${c.name}: reaching a row that never existed`).toBe(404);
			expect(stolen.message, `${c.name}: the two answers must be indistinguishable`).toBe(
				invented.message
			);

			await request.dispose();
		});
	}

	/**
	 * A picture is bytes, so reaching one is reading it rather than editing it.
	 *
	 * The other cases here attack a mutation; this one attacks the read, which
	 * is the whole of what a picture has. `/media/<id>` is the address of
	 * somebody's photograph — the one thing in this app where guessing a number
	 * would hand over the content itself rather than a row about it.
	 */
	test('a picture cannot be read from another account', async ({ playwright }) => {
		const request = await playwright.request.newContext({ baseURL: ORIGIN });

		// A real PNG: the service reads the bytes, not the name.
		const png = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJUlEQVR4nGP8//8/AymAiSTVoxpGNYxq' +
				'GNUwqmFUw6iGUQ1DTwMAWKMD/1sYQKQAAAAASUVORK5CYII=',
			'base64'
		);

		const uploaded = await request.post('/media', {
			headers: { Origin: ORIGIN, Cookie: alice.cookie },
			multipart: { file: { name: 'alice.png', mimeType: 'image/png', buffer: png } }
		});
		expect(uploaded.ok(), `Alice uploading: ${uploaded.status()}`).toBeTruthy();
		const id = (await uploaded.json()).id as number;

		const hers = await request.get(`/media/${id}`, { headers: { Cookie: alice.cookie } });
		expect(hers.status(), 'Alice reading her own').toBe(200);

		const stolen = await request.get(`/media/${id}`, { headers: { Cookie: mallory.cookie } });
		const invented = await request.get('/media/987654', { headers: { Cookie: mallory.cookie } });
		const anonymous = await request.get(`/media/${id}`, { headers: { Cookie: '' } });

		expect(stolen.status(), "reaching Alice's picture").toBe(404);
		expect(invented.status(), 'reaching one that never existed').toBe(404);
		expect(anonymous.status(), 'reaching one with no session').toBe(404);
		// Indistinguishable: a different body would say the row is there.
		expect(await stolen.text()).toBe(await invented.text());

		await request.dispose();
	});

	/**
	 * And a picture cannot be hung on somebody else's recipe, which is the other
	 * half: the gallery row carries its own user_id, and the recipe is checked
	 * before anything is stored.
	 */
	test('a picture cannot be attached to another account’s recipe', async ({ playwright }) => {
		const request = await playwright.request.newContext({ baseURL: ORIGIN });

		const created = await action(request, alice, '/kitchen/recipes?/create', {
			title: "alice's photographed recipe"
		});
		expect(['success', 'redirect']).toContain(created.type);
		const recipeId = await firstId(request, alice, '/kitchen/recipes', 'recipes');

		const png = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJUlEQVR4nGP8//8/AymAiSTVoxpGNYxq' +
				'GNUwqmFUw6iGUQ1DTwMAWKMD/1sYQKQAAAAASUVORK5CYII=',
			'base64'
		);

		const attempt = await request.post(`/kitchen/recipes/${recipeId}?/addPicture`, {
			headers: { Origin: ORIGIN, Cookie: mallory.cookie, 'x-sveltekit-action': 'true' },
			multipart: {
				recipeId,
				file: { name: 'mallory.png', mimeType: 'image/png', buffer: png }
			}
		});
		const body = await attempt.json();
		expect(body.status, "Mallory attaching to Alice's recipe").toBe(404);

		await request.dispose();
	});

	test('a session cannot be revoked from another account', async ({ playwright }) => {
		const request = await playwright.request.newContext({ baseURL: ORIGIN });

		const stolen = await action(request, mallory, '/settings/account?/revokeSession', {
			id: 'whatever-session-id'
		});
		expect(stolen.status).toBe(404);

		// Alice is still signed in.
		const res = await request.get('/settings/account', { headers: { Cookie: alice.cookie } });
		expect(res.status()).toBe(200);

		await request.dispose();
	});
});
