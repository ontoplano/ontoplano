/**
 * Webhooks: subscriptions, the address rules, and delivery behaviour.
 *
 * Delivery is mocked at `fetch` — the interesting questions are who gets
 * called, what the signature is, and that a dead address is given up on,
 * none of which needs a network.
 */
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let s: typeof import('../src/lib/server/services/webhooks');
const ctx = { userId: OWNER, now: new Date('2026-08-29T12:00:00Z'), tz: 'UTC' };

beforeAll(async () => {
	s = await import('../src/lib/server/services/webhooks');
});

afterEach(() => {
	vi.unstubAllGlobals();
	process.env.ONTOPLANO_SELF_HOST = 'true';
	database.exec('delete from webhook_subscriptions');
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('subscribing', () => {
	test('a subscription is created with a secret and listed', () => {
		const sub = s.createSubscription(ctx, {
			url: 'https://example.com/hook',
			events: ['todo.created', 'shopping.added']
		});
		expect(sub.secret).toMatch(/^whsec_/);
		expect(s.listSubscriptions(ctx)).toHaveLength(1);
	});

	test('unknown events are refused, not silently dropped to none', () => {
		expect(() =>
			s.createSubscription(ctx, { url: 'https://example.com/hook', events: ['nonsense'] })
		).toThrow(/at least one/i);
	});

	test('a stranger deleting my subscription gets the same answer as for one that never existed', () => {
		const sub = s.createSubscription(ctx, {
			url: 'https://example.com/hook',
			events: ['todo.created']
		});
		const stranger = { ...ctx, userId: STRANGER };
		expect(() => s.deleteSubscription(stranger, sub.id)).toThrow(/not found/i);
		expect(() => s.deleteSubscription(stranger, 999_999)).toThrow(/not found/i);
	});

	test('a hosted instance refuses private addresses; self-hosted may point anywhere', () => {
		process.env.ONTOPLANO_SELF_HOST = 'false';
		for (const url of [
			'https://localhost/hook',
			'http://127.0.0.1/hook',
			'http://10.1.2.3/hook',
			'http://192.168.1.1/hook',
			'http://169.254.169.254/latest/meta-data',
			'ftp://example.com/hook'
		]) {
			expect(() => s.createSubscription(ctx, { url, events: ['todo.created'] }), url).toThrow();
		}

		process.env.ONTOPLANO_SELF_HOST = 'true';
		expect(() =>
			s.createSubscription(ctx, { url: 'http://localhost:9999/hook', events: ['todo.created'] })
		).not.toThrow();
	});

	test('there is a ceiling on subscriptions', () => {
		for (let i = 0; i < 10; i++)
			s.createSubscription(ctx, { url: `https://example.com/hook/${i}`, events: ['todo.created'] });
		expect(() =>
			s.createSubscription(ctx, { url: 'https://example.com/hook/10', events: ['todo.created'] })
		).toThrow(/at most/i);
	});
});

describe('delivery', () => {
	test('an event reaches only the subscriptions that asked for it, signed', async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ url, init });
				return new Response(null, { status: 200 });
			})
		);

		const listening = s.createSubscription(ctx, {
			url: 'https://example.com/wants-todos',
			events: ['todo.created']
		});
		s.createSubscription(ctx, {
			url: 'https://example.com/wants-shopping',
			events: ['shopping.added']
		});

		s.emit(ctx, 'todo.created', { id: 1, title: 'buy milk' });
		await flush();

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://example.com/wants-todos');

		const body = calls[0].init.body as string;
		const headers = calls[0].init.headers as Record<string, string>;
		expect(JSON.parse(body)).toMatchObject({ event: 'todo.created', data: { id: 1 } });
		expect(headers['x-ontoplano-event']).toBe('todo.created');
		expect(headers['x-ontoplano-signature']).toBe(
			'sha256=' + createHmac('sha256', listening.secret).update(body).digest('hex')
		);
	});

	test("another account's subscription never hears my events", async () => {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				calls.push(url);
				return new Response(null, { status: 200 });
			})
		);

		const stranger = { ...ctx, userId: STRANGER };
		s.createSubscription(stranger, { url: 'https://example.com/theirs', events: ['todo.created'] });

		s.emit(ctx, 'todo.created', { id: 1 });
		await flush();
		expect(calls).toHaveLength(0);
	});

	test('a dead address is given up on after ten straight failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 500 }))
		);

		s.createSubscription(ctx, { url: 'https://example.com/dead', events: ['todo.created'] });

		for (let i = 0; i < 10; i++) {
			s.emit(ctx, 'todo.created', { id: i });
			await flush();
		}

		const [sub] = s.listSubscriptions(ctx);
		expect(sub.disabledAt).toBeTruthy();

		// Disabled means silent — not one more request.
		const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
		fetchMock.mockClear();
		s.emit(ctx, 'todo.created', { id: 99 });
		await flush();
		expect(fetchMock).not.toHaveBeenCalled();

		// And revival re-arms it.
		s.reviveSubscription(ctx, sub.id);
		s.emit(ctx, 'todo.created', { id: 100 });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
