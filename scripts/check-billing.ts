/**
 * Exercise the payment provider's half against a throwaway database.
 *
 * The e2e suite runs self-hosted, where there is no provider to talk to at all,
 * so the three properties that actually matter — a forged signature is refused,
 * a real one is applied, and a retry is not applied twice — are checked here.
 * The payloads are Paddle's shapes: the `ts=…;h1=…` signature over `ts:body`,
 * and the `{event_id, event_type, data}` envelope.
 *
 *   DATABASE_URL=/tmp/billing-check.db npx tsx scripts/check-billing.ts
 *
 * It writes only to that database.
 */
import { createHmac, randomUUID } from 'node:crypto';

process.env.PADDLE_API_KEY ??= 'pdl_sdbx_apikey_' + 'x'.repeat(20);
process.env.PADDLE_WEBHOOK_SECRET ??= 'a-test-secret';
process.env.PADDLE_CHECKOUT_URL ??= 'https://pay.paddle.io/checkout/hsc_test';
process.env.PADDLE_PRICE_ID_MONTHLY ??= 'pri_test_monthly';
delete process.env.ONTOPLANO_SELF_HOST;

const { db } = await import('../src/lib/server/db/index.js');
const { user } = await import('../src/lib/server/db/auth.schema.js');
const { handleWebhook, verifySignature, isBillingConfigured } =
	await import('../src/lib/server/services/billing.js');
const { resolvePlan, startTrial } = await import('../src/lib/server/services/subscriptions.js');

let failures = 0;

function check(what: string, ok: boolean, detail = '') {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures += 1;
}

/** A Paddle-Signature header the way Paddle builds it. */
function sign(body: string, secret = 'a-test-secret', at = Date.now()): string {
	const ts = Math.floor(at / 1000);
	const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
	return `ts=${ts};h1=${h1}`;
}

const userId = `check-${randomUUID()}`;
db.insert(user)
	.values({
		id: userId,
		name: 'Check',
		email: `${userId}@example.test`,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date()
	})
	.run();

check('billing is configured when the env says so', isBillingConfigured());

// --- the trial ---------------------------------------------------------------

startTrial(userId);
const trial = resolvePlan(userId);
check('a new account is on a Pro trial', trial.plan === 'pro' && trial.source === 'trial');

const lapsedAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
const lapsed = resolvePlan(userId, lapsedAt);
check(
	'a trial that has run out reads as lapsed, on the none plan',
	lapsed.plan === 'none' && lapsed.source === 'lapsed'
);

// --- signatures --------------------------------------------------------------

const body = JSON.stringify({
	event_id: `evt_${randomUUID().replaceAll('-', '')}`,
	event_type: 'subscription.activated',
	occurred_at: new Date().toISOString(),
	data: {
		id: 'sub_01check',
		status: 'active',
		customer_id: 'ctm_01check',
		custom_data: { user_id: userId },
		current_billing_period: {
			starts_at: new Date().toISOString(),
			ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
		},
		scheduled_change: null
	}
});

const signature = sign(body);

check('a real signature verifies', verifySignature(body, signature));
check('a forged one does not', !verifySignature(body, sign(body, 'the-wrong-secret')));
check('a tampered body does not', !verifySignature(body + ' ', signature));
check('a missing signature does not', !verifySignature(body, null));
check(
	'a replayed one from last week does not',
	!verifySignature(body, sign(body, 'a-test-secret', Date.now() - 7 * 24 * 60 * 60 * 1000))
);
check(
	'a rotated secret still verifies through the second h1',
	verifySignature(body, `${signature};h1=${'0'.repeat(64)}`) &&
		verifySignature(body, `${sign(body, 'the-wrong-secret')};h1=${signature.split('h1=')[1]}`)
);

// --- applying ----------------------------------------------------------------

const first = handleWebhook(body, 'fallback-id');
check('the first delivery is applied', first.applied === true);

const active = resolvePlan(userId);
check(
	'the account is on Pro afterwards',
	active.plan === 'pro' && active.source === 'subscription',
	`${active.plan}/${active.source}`
);

const second = handleWebhook(body, 'other-fallback-id');
check(
	"a retry of the same delivery — Paddle's event_id, not ours — is not applied twice",
	second.applied === false && 'reason' in second && second.reason === 'duplicate'
);

// --- the transaction fallback ------------------------------------------------
//
// The first payment can arrive before any subscription event carries our
// custom_data; transaction.completed binds subscription to account.

const otherUser = `check-${randomUUID()}`;
db.insert(user)
	.values({
		id: otherUser,
		name: 'Check Two',
		email: `${otherUser}@example.test`,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date()
	})
	.run();

const paid = JSON.stringify({
	event_id: `evt_${randomUUID().replaceAll('-', '')}`,
	event_type: 'transaction.completed',
	data: {
		id: 'txn_01check',
		subscription_id: 'sub_02check',
		customer_id: 'ctm_02check',
		custom_data: { user_id: otherUser },
		billing_period: {
			starts_at: new Date().toISOString(),
			ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
		}
	}
});
const paidOutcome = handleWebhook(paid, 'fallback-paid');
const paidPlan = resolvePlan(otherUser);
check(
	'transaction.completed alone puts the account on Pro',
	paidOutcome.applied === true && paidPlan.plan === 'pro' && paidPlan.source === 'subscription',
	`${paidPlan.plan}/${paidPlan.source}`
);

// A later subscription event with NO custom_data still finds the account.
const noCustom = JSON.stringify({
	event_id: `evt_${randomUUID().replaceAll('-', '')}`,
	event_type: 'subscription.updated',
	data: {
		id: 'sub_02check',
		status: 'past_due',
		customer_id: 'ctm_02check',
		custom_data: null,
		current_billing_period: null,
		next_billed_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
		scheduled_change: null
	}
});
handleWebhook(noCustom, 'fallback-nocustom');
const pastDue = resolvePlan(otherUser);
check(
	'a subscription event with no custom_data still reaches the right account',
	pastDue.plan === 'pro' && pastDue.status === 'past_due',
	`${pastDue.plan}/${pastDue.status}`
);

// --- cancelling --------------------------------------------------------------

const canceled = JSON.stringify({
	event_id: `evt_${randomUUID().replaceAll('-', '')}`,
	event_type: 'subscription.canceled',
	data: {
		id: 'sub_01check',
		status: 'canceled',
		customer_id: 'ctm_01check',
		custom_data: { user_id: userId },
		current_billing_period: null,
		canceled_at: new Date(Date.now() - 1000).toISOString(),
		scheduled_change: null
	}
});

handleWebhook(canceled, 'fallback-cancel');
const after = resolvePlan(userId);
check(
	'a canceled subscription past its period drops off Pro',
	after.plan === 'none' && after.source === 'lapsed',
	`${after.plan}/${after.source}`
);

console.log(failures === 0 ? '\nall good' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
