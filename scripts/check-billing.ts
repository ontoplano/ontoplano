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

// Assigned for empty as well as absent: a shell that exports PADDLE_API_KEY=
// with no value (an env file with a blank line) must not fail the fixtures.
const fixtureEnv: Record<string, string> = {
	PADDLE_API_KEY: 'pdl_sdbx_apikey_' + 'x'.repeat(20),
	PADDLE_WEBHOOK_SECRET: 'a-test-secret',
	PADDLE_CLIENT_TOKEN: 'test_clienttoken',
	PADDLE_PRICE_ID_MONTHLY: 'pri_test_monthly'
};
for (const [key, value] of Object.entries(fixtureEnv)) {
	if (!process.env[key]) process.env[key] = value;
}
delete process.env.ONTOPLANO_SELF_HOST;

const { db } = await import('../src/lib/server/db/index.js');
const { user } = await import('../src/lib/server/db/auth.schema.js');
const { handleWebhook, verifySignature, isBillingConfigured } =
	await import('../src/lib/server/services/billing.js');
const { resolvePlan, startTrial, trialCarryover } =
	await import('../src/lib/server/services/subscriptions.js');
const { paymentHoldFor } = await import('../src/lib/server/services/access.js');

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

const runTag = randomUUID().slice(0, 8);
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
		id: `sub_01${runTag}`,
		status: 'active',
		customer_id: `ctm_01${runTag}`,
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
		id: `txn_01${runTag}`,
		subscription_id: `sub_02${runTag}`,
		customer_id: `ctm_02${runTag}`,
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
		id: `sub_02${runTag}`,
		status: 'past_due',
		customer_id: `ctm_02${runTag}`,
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

// --- a provider-side trial is not stomped by its $0 payment -------------------
//
// Starting a card-first trial, Paddle sends BOTH subscription.activated
// (status trialing) and transaction.completed for the $0 first payment. The
// transaction handler may only bind an unknown subscription to its account —
// stamping `active` over a known trialing row once broke cycle switching by
// telling Paddle to prorate a trial.

const trialUser = `check-${randomUUID()}`;
db.insert(user)
	.values({
		id: trialUser,
		name: 'Check Trial',
		email: `${trialUser}@example.test`,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date()
	})
	.run();

const trialEnds = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
handleWebhook(
	JSON.stringify({
		event_id: `evt_${randomUUID().replaceAll('-', '')}`,
		event_type: 'subscription.activated',
		data: {
			id: `sub_03${runTag}`,
			status: 'trialing',
			customer_id: `ctm_03${runTag}`,
			custom_data: { user_id: trialUser },
			current_billing_period: { starts_at: new Date().toISOString(), ends_at: trialEnds },
			next_billed_at: trialEnds,
			scheduled_change: null
		}
	}),
	'fallback-trialing'
);
handleWebhook(
	JSON.stringify({
		event_id: `evt_${randomUUID().replaceAll('-', '')}`,
		event_type: 'transaction.completed',
		data: {
			id: `txn_02${runTag}`,
			subscription_id: `sub_03${runTag}`,
			customer_id: `ctm_03${runTag}`,
			custom_data: { user_id: trialUser },
			billing_period: {
				starts_at: new Date().toISOString(),
				ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			}
		}
	}),
	'fallback-zero-payment'
);
const stillTrialing = resolvePlan(trialUser);
check(
	'the $0 trial payment does not stamp a trialing subscription active',
	stillTrialing.status === 'trialing' && stillTrialing.source === 'trial',
	`${stillTrialing.status}/${stillTrialing.source}`
);

// --- what a returning account has left of its trial ---------------------------

const fresh = trialCarryover(`check-nobody-${runTag}`);
check(
	'a fresh account has no history and no carryover',
	!fresh.hasHistory && fresh.remainingDays === 0
);

const carrying = trialCarryover(trialUser);
check(
	'cancelling with four days left carries four days over',
	carrying.hasHistory && carrying.remainingDays === 4,
	`${carrying.remainingDays} days`
);

const spent = trialCarryover(trialUser, new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
check(
	'a trial that ran out carries nothing over',
	spent.hasHistory && spent.remainingDays === 0,
	`${spent.remainingDays} days`
);

// --- the account holds --------------------------------------------------------
//
// paymentHoldFor is the wall in front of pages, API and plugins alike: a
// verified account with no plan is sent to the card page, a lapsed one to the
// renew-or-export page, a running one is left alone.

const heldUser = `check-${randomUUID()}`;
db.insert(user)
	.values({
		id: heldUser,
		name: 'Check Held',
		email: `${heldUser}@example.test`,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date()
	})
	.run();

check('an account with no plan yet is held for billing', paymentHoldFor(heldUser) === 'billing');
check('a trialing account is not held', paymentHoldFor(trialUser) === null);
check('a subscribed account is not held', paymentHoldFor(otherUser) === null);

// --- cancelling --------------------------------------------------------------

const canceled = JSON.stringify({
	event_id: `evt_${randomUUID().replaceAll('-', '')}`,
	event_type: 'subscription.canceled',
	data: {
		id: `sub_01${runTag}`,
		status: 'canceled',
		customer_id: `ctm_01${runTag}`,
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
check('the lapsed account is held as expired', paymentHoldFor(userId) === 'expired');

console.log(failures === 0 ? '\nall good' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
