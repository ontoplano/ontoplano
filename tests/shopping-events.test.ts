/**
 * Shopping webhook events fire on transitions only.
 *
 * This is what lets two mirrored lists settle instead of ping-ponging: the
 * echo of a mirrored change is a no-op, and a no-op says nothing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let shopping: typeof import('../src/lib/server/services/shopping');
let webhooks: typeof import('../src/lib/server/services/webhooks');

const ctx = { userId: OWNER, now: new Date('2026-08-29T12:00:00Z'), tz: 'UTC' };
const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

beforeAll(async () => {
	shopping = await import('../src/lib/server/services/shopping');
	webhooks = await import('../src/lib/server/services/webhooks');
	vi.stubGlobal('fetch', fetchMock);
	webhooks.createSubscription(ctx, {
		url: 'https://example.com/hook',
		events: ['shopping.added', 'shopping.bought']
	});
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const itemIdOf = (name: string) => shopping.listItems(ctx).find((i) => i.name === name)!.id;

beforeEach(() => fetchMock.mockClear());

describe('edge-triggered shopping events', () => {
	test('a new item fires once; re-adding it while it waits fires nothing', async () => {
		shopping.createItem(ctx, { name: 'Milk', type: 'replenish' });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		shopping.createItem(ctx, { name: 'milk', type: 'replenish' });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('setBought fires on the transition and stays quiet on repeats', async () => {
		const id = itemIdOf('Milk');

		expect(shopping.setBought(ctx, id, true)).toEqual({ changed: true });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		expect(shopping.setBought(ctx, id, true)).toEqual({ changed: false });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('re-adding a bought item puts it back and fires', async () => {
		shopping.createItem(ctx, { name: 'Milk', type: 'replenish' });
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(shopping.listItems(ctx).find((i) => i.name === 'Milk')!.bought).toBe(false);
	});

	test('ensureCategoryId creates once and then finds', () => {
		const first = shopping.ensureCategoryId(ctx, 'Dairy');
		const again = shopping.ensureCategoryId(ctx, 'dairy');
		expect(again).toBe(first);
	});
});
