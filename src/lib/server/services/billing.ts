import { createHmac, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';

import { isPlanId, type PlanId, type SubscriptionStatus } from '../../plans.js';
import { db } from '../db/index.js';
import { billingEvents, subscriptions } from '../db/schema.js';
import { user } from '../db/auth.schema.js';
import { renderEmail } from '../email-template.js';
import { sendLogged } from './mail-log.js';
import { isSelfHosted } from '../settings.js';
import { applySubscription } from './subscriptions.js';
import { ValidationError } from './errors.js';

/**
 * Paddle, and the rules for talking to it.
 *
 * They are merchant of record, which is the whole reason: a solo founder
 * selling worldwide does not want to be the one who owes VAT in twenty
 * countries. (Lemon Squeezy came first and could not pay out to Brazil —
 * it pays sellers through Stripe Connect, which does not reach here.)
 *
 * Three rules, and they are the ones that make billing survivable:
 *
 *  - The webhook is the source of truth. Nothing in the app decides that
 *    somebody has paid; it only records what the provider said.
 *  - Every webhook is verified and stored by the provider's own event id, so a
 *    retry — and they do retry — is applied exactly once.
 *  - A nightly pass catches what webhooks missed, because a webhook that never
 *    arrived leaves no trace to notice.
 *
 * Sandbox and live are entirely separate Paddle accounts; which one this
 * instance talks to is decided by the API key alone (pdl_sdbx_… keys reach
 * sandbox-api.paddle.com), so there is no mode flag to forget.
 */

export const PROVIDER = 'paddle';

/** The signature header Paddle sends: `ts=1671552777;h1=eb4d…`. */
export const SIGNATURE_HEADER = 'paddle-signature';

/** A signature older than this is replayed, not late. Paddle sends promptly. */
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

type Config = {
	apiKey: string;
	webhookSecret: string;
	/** The dashboard-created hosted checkout page (pay.paddle.io/checkout/hsc_…). */
	checkoutUrl: string;
	priceMonthly: string;
	priceYearly: string;
};

function config(): Config {
	return {
		apiKey: process.env.PADDLE_API_KEY ?? '',
		webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? '',
		checkoutUrl: process.env.PADDLE_CHECKOUT_URL ?? '',
		priceMonthly: process.env.PADDLE_PRICE_ID_MONTHLY ?? '',
		priceYearly: process.env.PADDLE_PRICE_ID_YEARLY ?? ''
	};
}

/** Which Paddle answers this key — the prefix says, so nothing else has to. */
function apiBase(): string {
	return config().apiKey.startsWith('pdl_sdbx_')
		? 'https://sandbox-api.paddle.com'
		: 'https://api.paddle.com';
}

/** Whether this instance can actually sell anything. */
export function isBillingConfigured(): boolean {
	if (isSelfHosted()) return false;
	const { apiKey, webhookSecret, checkoutUrl, priceMonthly } = config();
	return apiKey !== '' && webhookSecret !== '' && checkoutUrl !== '' && priceMonthly !== '';
}

export function hasYearlyPrice(): boolean {
	return config().priceYearly !== '';
}

/**
 * Mint a checkout for one account, right now.
 *
 * Paddle has no static buy link that can carry our account id, so the buy
 * button is an action: a transaction is created with the id in custom_data —
 * which is what every later webhook matches on, because the address on the
 * receipt is the provider's business and may not be the one they signed in
 * with — and the customer lands on the hosted checkout page with that
 * transaction loaded.
 */
export async function createCheckout(
	userId: string,
	interval: 'monthly' | 'yearly' = 'monthly'
): Promise<string> {
	if (!isBillingConfigured()) throw new ValidationError('Billing is not configured here');
	const { apiKey, checkoutUrl, priceMonthly, priceYearly } = config();
	const priceId = interval === 'yearly' && priceYearly ? priceYearly : priceMonthly;

	const response = await fetch(`${apiBase()}/transactions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			items: [{ price_id: priceId, quantity: 1 }],
			custom_data: { user_id: userId }
		})
	});

	if (!response.ok) {
		console.error('billing: could not create a checkout', response.status, await response.text());
		throw new ValidationError('The payment provider did not answer. Try again in a minute.');
	}

	const body = (await response.json()) as { data?: { id?: string } };
	const transactionId = body.data?.id;
	if (!transactionId)
		throw new ValidationError('The payment provider answered strangely. Try again.');

	const url = new URL(checkoutUrl);
	url.searchParams.set('transaction_id', transactionId);
	return url.toString();
}

/**
 * Where an existing customer manages their card or cancels.
 *
 * Portal links carry a short-lived token and are not to be stored, so a fresh
 * session is created each time somebody looks at the billing page. Null when
 * there is nothing to manage or the provider does not answer — the page just
 * drops the button.
 */
export async function portalUrl(userId: string): Promise<string | null> {
	const { apiKey } = config();
	const row = db
		.select({ customerId: subscriptions.providerCustomerId })
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.get();
	if (!apiKey || !row?.customerId) return null;

	try {
		const response = await fetch(`${apiBase()}/customers/${row.customerId}/portal-sessions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
			body: '{}'
		});
		if (!response.ok) return null;
		const body = (await response.json()) as {
			data?: { urls?: { general?: { overview?: string } } };
		};
		return body.data?.urls?.general?.overview ?? null;
	} catch {
		return null;
	}
}

/**
 * Is this really from them?
 *
 * `Paddle-Signature: ts=…;h1=…` — HMAC-SHA256 of `ts:rawBody` with the
 * endpoint's secret, compared in constant time. The *raw* body:
 * re-serialising the JSON first would change a byte somewhere and the
 * comparison would fail for a reason nobody could see. More than one h1 can
 * appear while a secret is being rotated; any of them passing is a pass.
 */
export function verifySignature(
	rawBody: string,
	signature: string | null,
	now = new Date()
): boolean {
	const { webhookSecret } = config();
	if (!webhookSecret || !signature) return false;

	let ts = '';
	const given: string[] = [];
	for (const part of signature.split(';')) {
		const [key, value] = part.split('=', 2);
		if (key?.trim() === 'ts') ts = (value ?? '').trim();
		if (key?.trim() === 'h1' && value) given.push(value.trim());
	}
	if (!ts || given.length === 0) return false;

	const age = Math.abs(now.getTime() / 1000 - Number(ts));
	if (!Number.isFinite(age) || age > SIGNATURE_MAX_AGE_SECONDS) return false;

	const expected = createHmac('sha256', webhookSecret).update(`${ts}:${rawBody}`).digest('hex');
	return given.some(
		(h) =>
			h.length === expected.length &&
			timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(h, 'utf8'))
	);
}

/** What Paddle's statuses mean here. Paused is not entitled to anything. */
export function mapStatus(raw: unknown): SubscriptionStatus {
	switch (String(raw)) {
		case 'trialing':
			return 'trialing';
		case 'active':
			return 'active';
		case 'past_due':
			return 'past_due';
		case 'canceled':
			return 'canceled';
		case 'paused':
		default:
			return 'expired';
	}
}

export type WebhookOutcome =
	| { applied: true; userId: string; event: string }
	| { applied: false; reason: 'duplicate' | 'ignored' | 'unknown_account'; event: string };

/**
 * Apply one webhook, exactly once.
 *
 * The event is written down before it is applied, and the unique index on
 * (provider, event id) is what makes "exactly once" true rather than intended.
 *
 * Two event families matter. `subscription.*` carries the subscription
 * entity itself. `transaction.completed` is handled too because it is the
 * one place our own custom_data is certain to arrive — it is set on the
 * transaction the checkout was minted from — so the very first payment can
 * bind subscription to account even if the subscription events carry no
 * custom_data of their own.
 */
export function handleWebhook(
	rawBody: string,
	fallbackId: string,
	now = new Date()
): WebhookOutcome {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		throw new ValidationError('Body is not JSON');
	}

	const eventName = String(payload.event_type ?? '');
	const eventId =
		typeof payload.event_id === 'string' && payload.event_id ? payload.event_id : fallbackId;
	const data = (payload.data ?? {}) as Record<string, unknown>;

	const existing = db
		.select({ id: billingEvents.id, processedAt: billingEvents.processedAt })
		.from(billingEvents)
		.where(and(eq(billingEvents.provider, PROVIDER), eq(billingEvents.eventId, eventId)))
		.get();

	if (existing?.processedAt) return { applied: false, reason: 'duplicate', event: eventName };

	const rowId =
		existing?.id ??
		Number(
			db
				.insert(billingEvents)
				.values({
					provider: PROVIDER,
					eventId,
					eventType: eventName,
					payload: rawBody,
					createdAt: now.toISOString()
				})
				.run().lastInsertRowid
		);

	const markDone = (error?: string) =>
		db
			.update(billingEvents)
			.set({ processedAt: now.toISOString(), error: error ?? null })
			.where(eq(billingEvents.id, rowId))
			.run();

	const custom = (data.custom_data ?? {}) as Record<string, unknown>;
	const customUserId = typeof custom.user_id === 'string' ? custom.user_id : null;

	if (eventName === 'transaction.completed') {
		// A payment landed. The subscription events say the rest; this one
		// exists to bind subscription id to account via the transaction's
		// custom_data, and to flip the plan on without waiting for them.
		const subscriptionId = String(data.subscription_id ?? '');
		const resolved = customUserId ?? userIdFromSubscription(subscriptionId);
		if (!subscriptionId || !resolved) {
			markDone(subscriptionId ? 'no account for this transaction' : undefined);
			return subscriptionId
				? { applied: false, reason: 'unknown_account', event: eventName }
				: { applied: false, reason: 'ignored', event: eventName };
		}

		const period = (data.billing_period ?? {}) as Record<string, unknown>;
		applySubscription(
			resolved,
			{
				plan: 'pro',
				status: 'active',
				provider: PROVIDER,
				providerCustomerId: data.customer_id ? String(data.customer_id) : null,
				providerSubscriptionId: subscriptionId,
				currentPeriodEnd: iso(period.ends_at)
			},
			now
		);
		markDone();
		return { applied: true, userId: resolved, event: eventName };
	}

	if (!eventName.startsWith('subscription.')) {
		markDone();
		return { applied: false, reason: 'ignored', event: eventName };
	}

	const subscriptionId = String(data.id ?? '');
	const resolved = customUserId ?? userIdFromSubscription(subscriptionId);

	if (!resolved) {
		markDone('no account for this subscription');
		return { applied: false, reason: 'unknown_account', event: eventName };
	}

	const status = mapStatus(data.status);
	// Cancelled but still inside the paid period is still Pro: the period end
	// keeps that true, and `scheduled_change` says when the axe falls.
	const plan: PlanId = isPlanId(custom.plan) ? custom.plan : 'pro';
	const period = (data.current_billing_period ?? {}) as Record<string, unknown>;
	const change = (data.scheduled_change ?? null) as Record<string, unknown> | null;

	applySubscription(
		resolved,
		{
			plan: status === 'expired' ? 'none' : plan,
			status,
			provider: PROVIDER,
			providerCustomerId: data.customer_id ? String(data.customer_id) : null,
			providerSubscriptionId: subscriptionId,
			currentPeriodEnd: iso(period.ends_at ?? data.next_billed_at ?? data.canceled_at),
			cancelAt: change && String(change.action) === 'cancel' ? iso(change.effective_at) : null
		},
		now
	);

	markDone();
	return { applied: true, userId: resolved, event: eventName };
}

/**
 * The nightly pass.
 *
 * Two jobs. Anything whose period has run out is marked expired, which is what
 * a missed "subscription_expired" webhook would have done. And, when an API key
 * is configured, every subscription the provider still knows about is fetched
 * and compared — a webhook that never arrived leaves nothing to notice, and
 * this is the noticing.
 */
export async function reconcile(
	now = new Date()
): Promise<{ expired: number; checked: number; noticed: number }> {
	const nowIso = now.toISOString();

	// Before anything lapses: the warning has to precede the consequence.
	const noticed = await sendTrialEndingNotices(now);

	const lapsed = db
		.select({ id: subscriptions.id, userId: subscriptions.userId })
		.from(subscriptions)
		.where(
			and(
				or(
					eq(subscriptions.status, 'trialing'),
					eq(subscriptions.status, 'active'),
					eq(subscriptions.status, 'past_due'),
					eq(subscriptions.status, 'canceled')
				),
				or(
					and(isNull(subscriptions.currentPeriodEnd), isNull(subscriptions.trialEndsAt)),
					lt(subscriptions.currentPeriodEnd, nowIso)
				)
			)
		)
		.all();

	for (const row of lapsed) {
		db.update(subscriptions)
			.set({ plan: 'none', status: 'expired', updatedAt: nowIso })
			.where(eq(subscriptions.id, row.id))
			.run();
	}

	const { apiKey } = config();
	if (!apiKey) return { expired: lapsed.length, checked: 0, noticed };

	const live = db
		.select({
			userId: subscriptions.userId,
			providerSubscriptionId: subscriptions.providerSubscriptionId
		})
		.from(subscriptions)
		.where(eq(subscriptions.provider, PROVIDER))
		.all()
		.filter((row) => row.providerSubscriptionId);

	let checked = 0;

	for (const row of live) {
		try {
			const response = await fetch(`${apiBase()}/subscriptions/${row.providerSubscriptionId}`, {
				headers: { Authorization: `Bearer ${apiKey}` }
			});

			if (!response.ok) continue;

			const body = (await response.json()) as { data?: Record<string, unknown> };
			const data = body.data ?? {};
			const status = mapStatus(data.status);
			const period = (data.current_billing_period ?? {}) as Record<string, unknown>;
			const change = (data.scheduled_change ?? null) as Record<string, unknown> | null;

			applySubscription(
				row.userId,
				{
					plan: status === 'expired' ? 'none' : 'pro',
					status,
					provider: PROVIDER,
					providerCustomerId: data.customer_id ? String(data.customer_id) : null,
					providerSubscriptionId: String(data.id ?? row.providerSubscriptionId),
					currentPeriodEnd: iso(period.ends_at ?? data.next_billed_at ?? data.canceled_at),
					cancelAt: change && String(change.action) === 'cancel' ? iso(change.effective_at) : null
				},
				now
			);

			checked += 1;
		} catch (e) {
			console.error('billing: could not reconcile', row.providerSubscriptionId, e);
		}
	}

	return { expired: lapsed.length, checked, noticed };
}

/**
 * The mail two days before the trial becomes a charge.
 *
 * Not optional, and not marketing: a person who forgot their trial and meets
 * the receipt first becomes a chargeback and a one-star review. Sent once per
 * account — the stamp is a column, so a retried run cannot send it twice — and
 * only while the trial is actually still running.
 *
 * A transient send failure leaves the stamp unset so tomorrow's run retries,
 * and the failure sits on /admin and in the /healthz warnings meanwhile.
 */
const TRIAL_NOTICE_DAYS = 2;

export async function sendTrialEndingNotices(now = new Date()): Promise<number> {
	const nowIso = now.toISOString();
	const horizon = new Date(now.getTime() + TRIAL_NOTICE_DAYS * 86400_000).toISOString();

	const due = db
		.select({
			id: subscriptions.id,
			userId: subscriptions.userId,
			trialEndsAt: subscriptions.trialEndsAt,
			providerSubscriptionId: subscriptions.providerSubscriptionId,
			email: user.email
		})
		.from(subscriptions)
		.innerJoin(user, eq(user.id, subscriptions.userId))
		.where(
			and(
				eq(subscriptions.status, 'trialing'),
				isNull(subscriptions.trialNoticeSentAt),
				gt(subscriptions.trialEndsAt, nowIso),
				lte(subscriptions.trialEndsAt, horizon)
			)
		)
		.all();

	let sent = 0;

	for (const row of due) {
		const ends = new Date(row.trialEndsAt!).toISOString().slice(0, 10);
		const origin = process.env.ORIGIN ?? '';
		const manage = origin ? `${origin}/settings/billing` : 'the billing page in your settings';

		const hasCard = Boolean(row.providerSubscriptionId);
		const consequence = hasCard
			? `your subscription starts and the first charge happens then. If you would rather stop, cancel before that date and you will not be charged`
			: `everything you wrote stays yours and stays readable, but nothing new can be added until you subscribe`;

		const result = await sendLogged(
			'trial-notice',
			{
				to: row.email,
				...renderEmail({
					subject: `Your ontoplano trial ends on ${ends}`,
					lines: [`Your trial ends on ${ends} — ${consequence}.`],
					action: origin
						? { label: 'Manage your plan', url: `${origin}/settings/billing` }
						: undefined,
					small: [
						...(origin ? [] : [`Manage it on ${manage}.`]),
						'Questions? Just reply to this message.'
					]
				})
			},
			// The one mail money depends on: kept for retry, and a box with no
			// SMTP at all is a failure here, not a lifestyle.
			{ retryable: true, trackUnconfigured: true }
		);

		// Stamped only when it actually went. Undelivered stays unstamped, so
		// the next nightly reconcile tries again — and the failure row is
		// already on /admin and in the /healthz warnings meanwhile.
		if (result.delivered) {
			db.update(subscriptions)
				.set({ trialNoticeSentAt: nowIso, updatedAt: nowIso })
				.where(eq(subscriptions.id, row.id))
				.run();
			sent += 1;
		}
	}

	return sent;
}

function userIdFromSubscription(subscriptionId: string): string | null {
	if (!subscriptionId) return null;

	const row = db
		.select({ userId: subscriptions.userId })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.provider, PROVIDER),
				eq(subscriptions.providerSubscriptionId, subscriptionId)
			)
		)
		.get();

	return row?.userId ?? null;
}

function iso(value: unknown): string | null {
	if (typeof value !== 'string' || value === '') return null;
	const date = new Date(value);
	return isNaN(date.getTime()) ? null : date.toISOString();
}
