/**
 * The door itself, not the protocol behind it.
 *
 * `tests/mcp.test.ts` speaks to `handleBody` directly, so nothing there can
 * catch a mistake in the route — and the route is where authentication and
 * the payment hold live. Found as a real gap: the REST API and the calendar
 * feed both checked the hold, the assistant endpoint did not, so an expired
 * account kept full read and write access through its assistant token.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
import { hasBillingProvider } from './helpers/billing';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => {
	database.remove();
	process.env.ONTOPLANO_SELF_HOST = 'true';
	delete process.env.ONTOPLANO_SELLS;
	delete process.env.PADDLE_API_KEY;
	delete process.env.PADDLE_CLIENT_TOKEN;
	delete process.env.PADDLE_PRICE_ID_MONTHLY;
	delete process.env.PADDLE_WEBHOOK_SECRET;
});

let endpoint: typeof import('../src/routes/api/mcp/+server');
let secret: string;

beforeAll(async () => {
	// A selling instance, because holds only exist where something is sold.
	process.env.ONTOPLANO_SELF_HOST = 'false';
	process.env.ONTOPLANO_SELLS = 'true';
	process.env.PADDLE_API_KEY = 'pdl_sdbx_apikey_' + 'x'.repeat(20);
	process.env.PADDLE_CLIENT_TOKEN = 'test_clienttoken';
	process.env.PADDLE_PRICE_ID_MONTHLY = 'pri_test_monthly';
	process.env.PADDLE_WEBHOOK_SECRET = 'pdl_ntfset_test';

	endpoint = await import('../src/routes/api/mcp/+server');

	const { buildCtx } = await import('../src/lib/server/services/ctx');
	const { createToken } = await import('../src/lib/server/services/tokens');
	const { applySubscription } = await import('../src/lib/server/services/subscriptions');

	// Subscribed first: an unsubscribed account on a selling instance may not
	// even mint a token, which is its own (already tested) fence.
	applySubscription(OWNER, {
		plan: 'pro',
		status: 'active',
		provider: 'paddle',
		providerSubscriptionId: 'sub_mcp_test'
	});
	const made = createToken(buildCtx(OWNER), { name: 'assistant', scopes: ['today:read'] });
	secret = made.plaintext;
});

function post(body: unknown) {
	return endpoint.POST({
		request: new Request('http://localhost/api/mcp', {
			method: 'POST',
			headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

const LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

// Skipped where no provider is compiled in (the public checkout): with
// nothing to sell there is no hold, and the door rightly answers 200.
describe.skipIf(!hasBillingProvider())('the payment hold at the assistant door', () => {
	test('a subscribed account is answered', async () => {
		const res = await post(LIST);
		expect(res.status).toBe(200);
	});

	test('an expired account is refused with 402, same as the REST API', async () => {
		const { applySubscription } = await import('../src/lib/server/services/subscriptions');
		applySubscription(OWNER, {
			plan: 'none',
			status: 'expired',
			provider: 'paddle',
			providerSubscriptionId: 'sub_mcp_test'
		});

		const res = await post(LIST);
		expect(res.status).toBe(402);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe('payment_required');
	});
});
