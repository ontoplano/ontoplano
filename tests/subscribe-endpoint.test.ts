import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase } from './helpers/db';

/**
 * The public endpoint, and the one header that has to be exactly right.
 *
 * `Access-Control-Allow-Origin` is the whole of a CORS policy. Reflecting
 * whatever origin asked — which is the shape almost every wrong CORS
 * implementation has — means any page on the internet can post this form on
 * a visitor's behalf. So the instance names one origin and only that one is
 * ever echoed, and the answer carries `Vary: origin` so a cache in front
 * cannot hand one origin's header to another.
 */

const database = makeDatabase();
afterAll(() => database.remove());

vi.mock('../src/lib/server/email', () => ({
	sendEmail: async () => ({ delivered: true }),
	isEmailConfigured: () => true
}));

let enabled = true;
let allowedOrigin = 'https://ontoplano.test';
vi.mock('../src/lib/server/config', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/config')>();
	return {
		...actual,
		loadConfig: () => ({
			...actual.loadConfig(),
			newsletter: { enabled, origin: allowedOrigin }
		})
	};
});

let endpoint: typeof import('../src/routes/api/subscribe/+server');

beforeAll(async () => {
	process.env.ORIGIN = 'https://app.test.invalid';
	endpoint = await import('../src/routes/api/subscribe/+server');
});

beforeEach(() => {
	enabled = true;
	allowedOrigin = 'https://ontoplano.test';
	database.exec('delete from subscribers');
});

/** Enough of a SvelteKit event for a handler that reads three things off it. */
let client = 0;
function event(request: Request) {
	client += 1;
	// A fresh address each time: the endpoint is rate limited per client, and
	// a test suite is not what that limit is for.
	return {
		request,
		getClientAddress: () => `10.0.0.${client}`
	} as unknown as Parameters<typeof endpoint.POST>[0];
}

const post = (body: unknown, origin?: string) =>
	new Request('https://app.test.invalid/api/subscribe', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(origin ? { origin } : {})
		},
		body: JSON.stringify(body)
	});

describe('the CORS answer', () => {
	test('echoes the one origin the instance named', async () => {
		const res = await endpoint.POST(
			event(post({ email: 'a@test.invalid' }, 'https://ontoplano.test'))
		);

		expect(res.headers.get('access-control-allow-origin')).toBe('https://ontoplano.test');
		expect(res.headers.get('vary')).toBe('origin');
	});

	test('echoes nothing back to an origin it was not told about', async () => {
		const res = await endpoint.POST(event(post({ email: 'b@test.invalid' }, 'https://evil.test')));

		// Not the asked-for origin, and not `*` either.
		expect(res.headers.get('access-control-allow-origin')).toBeNull();
		expect(res.headers.get('vary')).toBe('origin');
	});

	test('echoes nothing when the instance named no origin', async () => {
		allowedOrigin = '';
		const res = await endpoint.POST(
			event(post({ email: 'c@test.invalid' }, 'https://ontoplano.test'))
		);

		expect(res.headers.get('access-control-allow-origin')).toBeNull();
	});

	test('the preflight answers the same way', async () => {
		const ask = (origin: string) =>
			endpoint.OPTIONS(
				event(
					new Request('https://app.test.invalid/api/subscribe', {
						method: 'OPTIONS',
						headers: { origin }
					})
				)
			);

		expect((await ask('https://ontoplano.test')).headers.get('access-control-allow-origin')).toBe(
			'https://ontoplano.test'
		);
		expect((await ask('https://evil.test')).headers.get('access-control-allow-origin')).toBeNull();
	});
});

describe('what it answers', () => {
	test('the same thing for a new address and one already on the list', async () => {
		const first = await endpoint.POST(event(post({ email: 'same@test.invalid' })));
		const firstBody = await first.json();

		const again = await endpoint.POST(event(post({ email: 'same@test.invalid' })));
		const againBody = await again.json();

		// If these ever differ the form becomes a way to ask whether an address
		// is a subscriber, about anybody.
		expect(first.status).toBe(again.status);
		expect(firstBody).toEqual(againBody);
	});

	test('a form post, not only JSON', async () => {
		const body = new URLSearchParams({ email: 'form@test.invalid' });
		const res = await endpoint.POST(
			event(
				new Request('https://app.test.invalid/api/subscribe', {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body
				})
			)
		);

		// The site's form is a real <form> so it works with the script blocked.
		expect(res.status).toBe(200);
		expect((await res.json()).ok).toBe(true);
	});

	test('400 and a sentence for something that is not an address', async () => {
		const res = await endpoint.POST(event(post({ email: 'nope' })));

		expect(res.status).toBe(400);
		expect((await res.json()).ok).toBe(false);
	});

	test('404 on an instance that keeps no list', async () => {
		enabled = false;
		expect((await endpoint.POST(event(post({ email: 'a@test.invalid' })))).status).toBe(404);
		expect(
			(
				await endpoint.OPTIONS(
					event(new Request('https://app.test.invalid/api/subscribe', { method: 'OPTIONS' }))
				)
			).status
		).toBe(404);
	});
});

describe('the rate limit', () => {
	test('stops one client posting all day', async () => {
		// The same address every time, so this is the limiter answering and not
		// anything about the addresses.
		const one = () =>
			endpoint.POST({
				request: post({ email: `flood-${Math.random()}@test.invalid` }),
				getClientAddress: () => '10.99.0.1'
			} as unknown as Parameters<typeof endpoint.POST>[0]);

		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) statuses.push((await one()).status);

		expect(statuses).toContain(429);
		const refused = statuses.indexOf(429);
		expect(refused).toBeGreaterThan(0);
	});
});
