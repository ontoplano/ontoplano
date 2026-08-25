/**
 * Exercise the payment provider's half against a throwaway database.
 *
 * The e2e suite runs self-hosted, where there is no provider to talk to at all,
 * so the three properties that actually matter — a forged signature is refused,
 * a real one is applied, and a retry is not applied twice — are checked here.
 *
 *   DATABASE_URL=/tmp/billing-check.db npx tsx scripts/check-billing.ts
 *
 * It writes only to that database.
 */
import { createHmac, randomUUID } from 'node:crypto';

process.env.LEMONSQUEEZY_WEBHOOK_SECRET ??= 'a-test-secret';
process.env.LEMONSQUEEZY_CHECKOUT_URL ??= 'https://example.lemonsqueezy.com/checkout/buy/abc';
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
	'a trial that has run out reads as lapsed, on free',
	lapsed.plan === 'free' && lapsed.source === 'lapsed'
);

// --- signatures --------------------------------------------------------------

const body = JSON.stringify({
	meta: {
		event_name: 'subscription_created',
		custom_data: { user_id: userId }
	},
	data: {
		id: '9001',
		attributes: {
			status: 'active',
			customer_id: 4242,
			renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
			urls: { customer_portal: 'https://example.lemonsqueezy.com/portal/xyz' }
		}
	}
});

const signature = createHmac('sha256', 'a-test-secret').update(body).digest('hex');

check('a real signature verifies', verifySignature(body, signature));
check('a forged one does not', !verifySignature(body, 'f'.repeat(signature.length)));
check('a tampered body does not', !verifySignature(body + ' ', signature));
check('a missing signature does not', !verifySignature(body, null));

// --- applying ----------------------------------------------------------------

const eventId = randomUUID();
const first = handleWebhook(body, eventId);
check('the first delivery is applied', first.applied === true);

const active = resolvePlan(userId);
check(
	'the account is on Pro afterwards',
	active.plan === 'pro' && active.source === 'subscription',
	`${active.plan}/${active.source}`
);

const second = handleWebhook(body, eventId);
check(
	'a retry of the same delivery is not applied twice',
	second.applied === false && 'reason' in second && second.reason === 'duplicate'
);

// --- cancelling --------------------------------------------------------------

const cancelled = JSON.stringify({
	meta: { event_name: 'subscription_expired', custom_data: { user_id: userId } },
	data: {
		id: '9001',
		attributes: { status: 'expired', ends_at: new Date(Date.now() - 1000).toISOString() }
	}
});

handleWebhook(cancelled, randomUUID());
const after = resolvePlan(userId);
check(
	'an expired subscription drops to free',
	after.plan === 'free',
	`${after.plan}/${after.source}`
);

console.log(failures === 0 ? '\nall good' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
