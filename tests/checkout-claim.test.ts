/**
 * A payment the webhook never told us about.
 *
 * This is the bug this file exists for. The provider's notification
 * destination was left pointing at a hostname that had become a redirect;
 * the provider does not follow redirects, so every billing event failed. A
 * customer paid, the provider mailed them a receipt, and coming back they were
 * sent to the start of the payment flow — where the obvious next step is to
 * pay again.
 *
 * The nightly reconcile could not save them either: it walks subscription
 * rows, and the row is exactly what the missing webhook never wrote.
 *
 * So the app writes down every checkout when it opens one, and can ask the
 * provider what became of it. These tests run that path with the provider
 * stubbed, and the first of them fails on the old code — there was nothing to
 * ask with.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let billing: typeof import('../src/lib/server/services/billing');
let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let access: typeof import('../src/lib/server/services/access');

const TXN = 'txn_test_0001';
const SUB = 'sub_test_0001';

/** Paddle's answers, reduced to the fields this path reads. */
function providerReplies(replies: Record<string, unknown>) {
	return vi.fn(async (input: string | URL) => {
		const url = String(input);
		for (const [path, data] of Object.entries(replies)) {
			if (url.endsWith(path)) {
				return { ok: true, json: async () => ({ data }) } as unknown as Response;
			}
		}
		return { ok: false, status: 404, text: async () => 'no' } as unknown as Response;
	});
}

const aTrialingSubscription = {
	id: SUB,
	status: 'trialing',
	customer_id: 'ctm_test',
	current_billing_period: {
		starts_at: '2026-09-01T00:00:00Z',
		ends_at: '2126-09-15T00:00:00Z'
	}
};

beforeAll(async () => {
	process.env.ONTOPLANO_SELF_HOST = 'false';
	process.env.PADDLE_API_KEY = 'pdl_sdbx_apikey_' + 'x'.repeat(20);
	process.env.PADDLE_CLIENT_TOKEN = 'test_clienttoken';
	process.env.PADDLE_PRICE_ID_MONTHLY = 'pri_test_monthly';
	process.env.PADDLE_WEBHOOK_SECRET = 'pdl_ntfset_test';

	billing = await import('../src/lib/server/services/billing');
	subscriptions = await import('../src/lib/server/services/subscriptions');
	access = await import('../src/lib/server/services/access');
});

afterEach(() => {
	vi.unstubAllGlobals();
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

describe('a checkout the provider never reported', () => {
	test('opening one writes it down, before the customer leaves', async () => {
		vi.stubGlobal(
			'fetch',
			providerReplies({
				'/transactions': { id: TXN }
			})
		);

		const url = await billing.createCheckout(OWNER, 'monthly');
		expect(url).toContain(TXN);

		// The row is the whole point: without it there is no question to ask.
		expect(billing.hasUnsettledCheckout(OWNER)).toBe(true);
	});

	test('the account is held at the pay page while nothing has landed', () => {
		expect(subscriptions.resolvePlan(OWNER).plan).toBe('none');
		expect(access.paymentHoldFor(OWNER)).toBe('billing');
	});

	test('asking the provider finds the payment and lets them in', async () => {
		vi.stubGlobal(
			'fetch',
			providerReplies({
				[`/transactions/${TXN}`]: { id: TXN, status: 'completed', subscription_id: SUB },
				[`/subscriptions/${SUB}`]: aTrialingSubscription
			})
		);

		expect(await billing.claimCheckouts(OWNER)).toBe(true);

		// What the customer actually cares about: they are no longer being asked
		// to pay for something they have paid for.
		expect(access.paymentHoldFor(OWNER)).toBe(null);
		expect(subscriptions.resolvePlan(OWNER).plan).toBe('pro');
		expect(subscriptions.resolvePlan(OWNER).status).toBe('trialing');
	});

	test('and it is not asked about twice', async () => {
		expect(billing.hasUnsettledCheckout(OWNER)).toBe(false);

		const fetcher = providerReplies({});
		vi.stubGlobal('fetch', fetcher);
		expect(await billing.claimCheckouts(OWNER)).toBe(false);
		expect(fetcher).not.toHaveBeenCalled();
	});

	test('the chase is counted, because it means the webhook is broken', () => {
		// Self-healing that says nothing would fix one customer and leave the
		// destination wrong for everybody else.
		expect(billing.chasedCheckouts(new Date(Date.now() - 60_000))).toBe(1);
	});
});

describe('a checkout that came to nothing', () => {
	const ABANDONED = 'txn_test_0002';

	test('is left open while the customer might still be typing', async () => {
		vi.stubGlobal('fetch', providerReplies({ '/transactions': { id: ABANDONED } }));
		await billing.createCheckout(STRANGER, 'monthly');

		vi.stubGlobal(
			'fetch',
			providerReplies({
				[`/transactions/${ABANDONED}`]: { id: ABANDONED, status: 'ready' }
			})
		);
		expect(await billing.claimCheckouts(STRANGER)).toBe(false);
		expect(billing.hasUnsettledCheckout(STRANGER)).toBe(true);
	});

	test('and closed once the provider says it was cancelled', async () => {
		vi.stubGlobal(
			'fetch',
			providerReplies({
				[`/transactions/${ABANDONED}`]: { id: ABANDONED, status: 'canceled' }
			})
		);
		expect(await billing.claimCheckouts(STRANGER)).toBe(false);
		expect(billing.hasUnsettledCheckout(STRANGER)).toBe(false);
		// Nothing was granted on the way past.
		expect(subscriptions.resolvePlan(STRANGER).plan).toBe('none');
	});
});
