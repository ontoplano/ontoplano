/**
 * Google Play Billing, with Google stood in.
 *
 * The purchase happened on the device; all the server can honestly do is ask
 * Google what the token means — so these tests stand Google up locally (the
 * token mint and the publisher API are both plain fetch, with overridable
 * bases) and drive the claims and notifications end to end: a good purchase
 * lands as an entitlement, a token for a cheaper plan cannot claim a dearer
 * one, an unacknowledged purchase gets acknowledged, and a notification is
 * never trusted — the state is re-fetched.
 */
// Skipped on a clone without the Play channel compiled in — see
// src/lib/server/billing/contract.ts. They run in the build that sells.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
import { hasPlayChannel } from './helpers/billing';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
	database.remove();
});

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

let billing: typeof import('../src/lib/server/services/billing');
let subscriptions: typeof import('../src/lib/server/services/subscriptions');

beforeAll(async () => {
	// The suite runs self-hosted (everything free); these tests are about the
	// instance that sells, so the switch flips for their duration.
	process.env.ONTOPLANO_SELF_HOST = 'false';
	process.env.PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
		client_email: 'svc@test.iam.gserviceaccount.com',
		private_key: PEM
	});
	process.env.PLAY_RTDN_TOKEN = 'rtdn-secret';
	process.env.PLAY_API_BASE = 'https://play.test';
	process.env.PLAY_TOKEN_URI = 'https://oauth.test/token';
	billing = await import('../src/lib/server/services/billing');
	subscriptions = await import('../src/lib/server/services/subscriptions');
});

afterEach(() => vi.unstubAllGlobals());

/** Google, reduced to what this path reads. */
function googleAnswers(purchase: Record<string, unknown>, acknowledged: string[] = []) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = String(input);
		if (url.startsWith('https://oauth.test/token')) {
			return new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), {
				status: 200
			});
		}
		if (url.includes('/purchases/subscriptionsv2/tokens/')) {
			if (url.endsWith('/unknown-token')) return new Response('{}', { status: 404 });
			return new Response(JSON.stringify(purchase), { status: 200 });
		}
		if (url.includes(':acknowledge')) {
			acknowledged.push(url);
			return new Response('{}', { status: 200 });
		}
		return new Response('no', { status: 500 });
	});
}

const activePurchase = (sku: string, extra: Record<string, unknown> = {}) => ({
	subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
	acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
	lineItems: [{ productId: sku, expiryTime: '2027-01-01T00:00:00Z' }],
	...extra
});

describe.skipIf(!hasPlayChannel())('a purchase made in the store copy', () => {
	test('a verified purchase becomes the entitlement, and is acknowledged', async () => {
		const acked: string[] = [];
		vi.stubGlobal('fetch', googleAnswers(activePurchase('ontoplano.solo.monthly'), acked));

		const result = await billing.playClaim(OWNER, {
			sku: 'ontoplano.solo.monthly',
			purchaseToken: 'tok-good-1'
		});
		expect(result.status).toBe('active');
		expect(subscriptions.resolvePlan(OWNER).plan).toBe('pro');
		expect(acked).toHaveLength(1); // Play refunds unacknowledged purchases

		const row = database.get(
			'select provider, provider_subscription_id as sub from subscriptions where user_id = ?',
			OWNER
		) as { provider: string; sub: string };
		expect(row.provider).toBe('play');
		expect(row.sub).toBe('tok-good-1');
	});

	test('a token for a cheaper plan cannot claim a dearer one', async () => {
		vi.stubGlobal('fetch', googleAnswers(activePurchase('ontoplano.solo.monthly')));
		await expect(
			billing.playClaim(OWNER, { sku: 'ontoplano.family.yearly', purchaseToken: 'tok-good-1' })
		).rejects.toThrow(/different plan/);
	});

	test('a token Google does not recognise is refused, loudly', async () => {
		vi.stubGlobal('fetch', googleAnswers(activePurchase('ontoplano.solo.monthly')));
		await expect(
			billing.playClaim(OWNER, { sku: 'ontoplano.solo.monthly', purchaseToken: 'unknown-token' })
		).rejects.toThrow(/does not recognise/);
	});

	test('a sku this app does not sell is refused before Google is asked', async () => {
		const fetcher = googleAnswers(activePurchase('whatever'));
		vi.stubGlobal('fetch', fetcher);
		await expect(
			billing.playClaim(OWNER, { sku: 'com.somebody.else', purchaseToken: 'tok' })
		).rejects.toThrow(/not a plan/);
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe.skipIf(!hasPlayChannel())('a notification from Play', () => {
	const push = (payload: Record<string, unknown>) =>
		JSON.stringify({
			message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') }
		});

	test('re-fetches the truth and moves the entitlement', async () => {
		// The claim above stored tok-good-1 for OWNER. Play now says it expired —
		// but the message only names the token; the state comes from the fetch.
		vi.stubGlobal(
			'fetch',
			googleAnswers({
				subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
				lineItems: [{ productId: 'ontoplano.solo.monthly', expiryTime: '2026-01-01T00:00:00Z' }]
			})
		);
		const outcome = await billing.playRtdn(
			push({
				packageName: 'app.ontoplano.twa',
				subscriptionNotification: { purchaseToken: 'tok-good-1', notificationType: 13 }
			})
		);
		expect(outcome.applied).toBe(true);
		expect(subscriptions.resolvePlan(OWNER).plan).toBe('none');
	});

	test('an unknown token is reported, not guessed at', async () => {
		vi.stubGlobal('fetch', googleAnswers(activePurchase('ontoplano.solo.monthly')));
		const outcome = await billing.playRtdn(
			push({
				packageName: 'app.ontoplano.twa',
				subscriptionNotification: { purchaseToken: 'tok-nobody', notificationType: 2 }
			})
		);
		expect(outcome).toEqual({ applied: false, reason: 'unknown_account' });
	});

	test("Google's test ping and junk are ignored without a fetch", async () => {
		const fetcher = googleAnswers({});
		vi.stubGlobal('fetch', fetcher);
		expect(await billing.playRtdn(push({ testNotification: {} }))).toEqual({
			applied: false,
			reason: 'test'
		});
		expect(await billing.playRtdn('not even json')).toEqual({
			applied: false,
			reason: 'malformed'
		});
		expect(fetcher).not.toHaveBeenCalled();
	});
});

describe.skipIf(!hasPlayChannel())('the notification door', () => {
	test('opens only for the exact token, compared blind', async () => {
		vi.stubGlobal('fetch', googleAnswers(activePurchase('ontoplano.solo.monthly')));
		const { POST } = await import('../src/routes/api/billing/play/rtdn/+server');
		const call = (token: string | null) =>
			POST({
				request: new Request('https://app.test/api/billing/play/rtdn', {
					method: 'POST',
					body: JSON.stringify({ message: { data: '' } })
				}),
				url: new URL(
					`https://app.test/api/billing/play/rtdn${token === null ? '' : `?token=${token}`}`
				)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

		expect((await call(null)).status).toBe(401);
		expect((await call('wrong')).status).toBe(401);
		expect((await call('rtdn-secret')).status).toBe(200);
	});
});
