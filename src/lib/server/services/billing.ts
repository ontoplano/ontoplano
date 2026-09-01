import { createHmac, timingSafeEqual } from 'node:crypto';

import { and, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';

import { isPlanId, type PlanId, type Pricing, type SubscriptionStatus } from '../../plans.js';
import { db } from '../db/index.js';
import { billingCheckouts, billingEvents, subscriptions } from '../db/schema.js';
import { user } from '../db/auth.schema.js';
import { renderEmail } from '../email-template.js';
import { sendLogged } from './mail-log.js';
import { isSelfHosted, pricing } from '../settings.js';
import {
	activeProviderSubscription,
	applySubscription,
	startTrial,
	trialCarryover
} from './subscriptions.js';
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
 *  - The webhook is never the ONLY way to learn. Every checkout is written down
 *    when it is opened, so the app can ask what became of it — on the customer's
 *    way back, and again nightly for anybody who closed the tab.
 *
 * That third rule is not theoretical. The webhook destination was left pointing
 * at a hostname that had become a redirect; the provider does not follow those,
 * so every billing event failed silently for hours. A customer paid, got a
 * receipt by mail, came back, and was shown the pay page again — the worst
 * thing this code can do. The nightly pass could not save it either, because it
 * walked subscription rows and the row is exactly what never got written.
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
	/** The Paddle.js client-side token (test_/live_) — safe in a page, made for it. */
	clientToken: string;
	priceMonthly: string;
	priceYearly: string;
	priceFamilyMonthly: string;
	priceFamilyYearly: string;
};

/** Which of the two plans is being bought. */
export type PlanTier = 'solo' | 'family';

function config(): Config {
	return {
		apiKey: process.env.PADDLE_API_KEY ?? '',
		webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? '',
		clientToken: process.env.PADDLE_CLIENT_TOKEN ?? '',
		priceMonthly: process.env.PADDLE_PRICE_ID_MONTHLY ?? '',
		priceYearly: process.env.PADDLE_PRICE_ID_YEARLY ?? '',
		// The family plan is the same product at a bigger price covering more
		// accounts. Absent means this instance does not sell one.
		priceFamilyMonthly: process.env.PADDLE_PRICE_ID_FAMILY_MONTHLY ?? '',
		priceFamilyYearly: process.env.PADDLE_PRICE_ID_FAMILY_YEARLY ?? ''
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
	const { apiKey, webhookSecret, clientToken, priceMonthly } = config();
	return apiKey !== '' && webhookSecret !== '' && clientToken !== '' && priceMonthly !== '';
}

/**
 * What the price IS, asked of the one place that charges it.
 *
 * Once billing is configured, Paddle's price entities are the source of
 * truth — amount, currency and the trial length all live on them — and the
 * env numbers are only what an instance quotes before it sells. Cached for
 * ten minutes: the front page asks on every visit and the answer changes
 * once a year.
 */
let priceCache: { at: number; value: Pricing } | null = null;

export async function displayPricing(): Promise<Pricing> {
	const base = pricing();
	if (!isBillingConfigured()) return base;
	if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.value;

	const { apiKey, priceMonthly, priceYearly } = config();
	type PriceEntity = {
		unit_price?: { amount?: string; currency_code?: string };
		trial_period?: { interval?: string; frequency?: number } | null;
	};
	const fetchPrice = async (id: string): Promise<PriceEntity | null> => {
		const response = await fetch(`${apiBase()}/prices/${id}`, {
			headers: { Authorization: `Bearer ${apiKey}` }
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { data?: PriceEntity };
		return body.data ?? null;
	};

	try {
		const monthly = await fetchPrice(priceMonthly);
		const yearly = priceYearly ? await fetchPrice(priceYearly) : null;
		const monthlyAmount = Number(monthly?.unit_price?.amount);
		const yearlyAmount = Number(yearly?.unit_price?.amount);
		const trial = monthly?.trial_period;
		const value: Pricing = {
			...base,
			monthlyCents: Number.isFinite(monthlyAmount) ? monthlyAmount : base.monthlyCents,
			yearlyCents: Number.isFinite(yearlyAmount) ? yearlyAmount : base.yearlyCents,
			currency: monthly?.unit_price?.currency_code ?? base.currency,
			trialDays:
				trial && trial.interval === 'day' && Number.isFinite(Number(trial.frequency))
					? Number(trial.frequency)
					: base.trialDays
		};
		priceCache = { at: Date.now(), value };
		return value;
	} catch {
		// The provider being unreachable is the reconcile's problem, not the
		// front page's: quote the fallback rather than 500 on a visitor.
		return base;
	}
}

/** What the /buy page needs to start Paddle.js — null when there is no selling. */
export function paddleClientConfig(): {
	token: string;
	environment: 'sandbox' | 'production';
} | null {
	if (!isBillingConfigured()) return null;
	return {
		token: config().clientToken,
		environment: config().apiKey.startsWith('pdl_sdbx_') ? 'sandbox' : 'production'
	};
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
 * with — and the customer lands on /buy with that transaction loaded.
 * Our own page, not Paddle's hosted checkout: the hosted one is gated
 * behind approval on live accounts, and /buy is the same overlay without
 * the gate.
 */
export async function createCheckout(
	userId: string,
	interval: 'monthly' | 'yearly' = 'monthly',
	tier: PlanTier = 'solo'
): Promise<string> {
	if (!isBillingConfigured()) throw new ValidationError('Billing is not configured here');
	const { apiKey, priceMonthly, priceYearly, priceFamilyMonthly, priceFamilyYearly } = config();

	/*
	 * Four prices, one product.
	 *
	 * The family plan is not a second thing to own — it is the same
	 * subscription with more seats on it, which is why the seat count comes
	 * back from the price rather than being decided here.
	 */
	const family = tier === 'family' && priceFamilyMonthly;
	const priceId = family
		? interval === 'yearly' && priceFamilyYearly
			? priceFamilyYearly
			: priceFamilyMonthly
		: interval === 'yearly' && priceYearly
			? priceYearly
			: priceMonthly;

	if (tier === 'family' && !family) {
		throw new ValidationError('This instance does not sell a family plan');
	}

	// A fresh account buys the catalog price, trial included. A returning one
	// gets an inline copy of it whose trial is whatever it still has — the
	// days left of a cancelled trial carry over, and zero means billed today.
	// Serial fourteen-day trials by cancel-and-rebuy end here.
	const { hasHistory, remainingDays } = trialCarryover(userId);
	let items: unknown[] = [{ price_id: priceId, quantity: 1 }];
	if (hasHistory) {
		const entity = await priceEntity(priceId);
		if (!entity?.product_id || !entity.unit_price || !entity.billing_cycle) {
			throw new ValidationError('The payment provider did not answer. Try again in a minute.');
		}
		items = [
			{
				quantity: 1,
				price: {
					description: `${entity.description ?? 'Ontoplano Pro'} — returning`,
					product_id: entity.product_id,
					unit_price: entity.unit_price,
					billing_cycle: entity.billing_cycle,
					...(remainingDays > 0
						? { trial_period: { interval: 'day', frequency: remainingDays } }
						: {})
				}
			}
		];
	}

	const response = await fetch(`${apiBase()}/transactions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			items,
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

	// Written down BEFORE the customer leaves for the payment window. This row
	// is what lets the app find out what happened without being told.
	db.insert(billingCheckouts)
		.values({ userId, provider: PROVIDER, providerTransactionId: transactionId })
		.onConflictDoNothing()
		.run();

	// Relative on purpose: the page is ours. Paddle.js reads _ptxn itself.
	return `/buy?_ptxn=${transactionId}`;
}

/* ── What became of a checkout ───────────────────────────────────────────────
 *
 * The webhook is still the fast path, and when it arrives it stamps the
 * checkout settled. What follows is the answer to "and when it does not".
 */

/** Mark a checkout done, and say which route found out. */
export function settleCheckout(transactionId: string, by: 'webhook' | 'claim'): void {
	db.update(billingCheckouts)
		.set({ settledAt: new Date().toISOString(), settledBy: by })
		.where(
			and(
				eq(billingCheckouts.providerTransactionId, transactionId),
				isNull(billingCheckouts.settledAt)
			)
		)
		.run();
}

/** Checkouts opened and never accounted for, oldest first. */
function unsettledCheckouts(userId?: string) {
	const unsettled = isNull(billingCheckouts.settledAt);
	return db
		.select({
			id: billingCheckouts.id,
			userId: billingCheckouts.userId,
			providerTransactionId: billingCheckouts.providerTransactionId,
			createdAt: billingCheckouts.createdAt
		})
		.from(billingCheckouts)
		.where(userId ? and(unsettled, eq(billingCheckouts.userId, userId)) : unsettled)
		.orderBy(billingCheckouts.id)
		.all();
}

/** Is there anything to ask about for this account? One indexed read. */
export function hasUnsettledCheckout(userId: string): boolean {
	return unsettledCheckouts(userId).length > 0;
}

/**
 * How many accounts a subscription covers, read off what it is paying for.
 *
 * The seat count belongs to the price, not to this app's guess: the family
 * prices carry `{"seats": 5}` in their custom data, and the price id is the
 * fallback for a provider that does not hand custom data back on a
 * subscription. Anything else is one seat, which is the safe reading — a
 * mistake here gives away paid access.
 */
export function seatsFromItems(items: unknown): number {
	if (!Array.isArray(items)) return 1;
	const { priceFamilyMonthly, priceFamilyYearly } = config();
	const familyIds = [priceFamilyMonthly, priceFamilyYearly].filter(Boolean);

	let seats = 1;
	for (const raw of items) {
		const item = (raw ?? {}) as Record<string, unknown>;
		const price = (item.price ?? {}) as Record<string, unknown>;
		const custom = (price.custom_data ?? null) as Record<string, unknown> | null;

		const declared = Number(custom?.seats);
		if (Number.isFinite(declared) && declared > seats) seats = Math.floor(declared);
		else if (price.id && familyIds.includes(String(price.id))) {
			seats = Math.max(seats, pricing().familySeats);
		}
	}
	// A ceiling, so a mistyped price cannot hand out an unbounded number.
	return Math.min(seats, 20);
}

/** Write a provider subscription entity onto an account. */
function applyProviderSubscription(
	userId: string,
	data: Record<string, unknown>,
	now: Date,
	fallbackSubscriptionId?: string
): void {
	const status = mapStatus(data.status);
	const period = (data.current_billing_period ?? {}) as Record<string, unknown>;
	const change = (data.scheduled_change ?? null) as Record<string, unknown> | null;

	applySubscription(
		userId,
		{
			plan: status === 'expired' ? 'none' : 'pro',
			status,
			provider: PROVIDER,
			providerCustomerId: data.customer_id ? String(data.customer_id) : null,
			providerSubscriptionId: String(data.id ?? fallbackSubscriptionId ?? ''),
			currentPeriodEnd: iso(period.ends_at ?? data.next_billed_at ?? data.canceled_at),
			cancelAt: change && String(change.action) === 'cancel' ? iso(change.effective_at) : null,
			trialEndsAt: status === 'trialing' ? iso(period.ends_at ?? data.next_billed_at) : null,
			seats: seatsFromItems(data.items)
		},
		now
	);
}

async function getJson(path: string): Promise<Record<string, unknown> | null> {
	const { apiKey } = config();
	if (!apiKey) return null;
	try {
		const response = await fetch(`${apiBase()}${path}`, {
			headers: { Authorization: `Bearer ${apiKey}` }
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { data?: Record<string, unknown> };
		return body.data ?? null;
	} catch (e) {
		console.error('billing: could not reach the provider for', path, e);
		return null;
	}
}

/**
 * Ask the provider what became of the checkouts this account opened.
 *
 * Called on the way back from the payment window, before the gate that would
 * otherwise send a paying customer to the pay page. Cheap and bounded: it only
 * runs when there is an unsettled checkout row, and only touches that account.
 *
 * A checkout that produced a subscription is applied and settled. One that
 * produced nothing — abandoned, or a card that was declined — is settled too
 * once it is old enough, so the question is not asked forever.
 *
 * Returns true when something was actually applied, which the caller uses to
 * decide whether to recompute access before answering the request.
 */
export async function claimCheckouts(userId: string, now = new Date()): Promise<boolean> {
	const pending = unsettledCheckouts(userId);
	if (pending.length === 0) return false;

	let applied = false;

	for (const row of pending) {
		const transaction = await getJson(`/transactions/${row.providerTransactionId}`);
		if (!transaction) continue;

		const subscriptionId = transaction.subscription_id ? String(transaction.subscription_id) : null;

		if (subscriptionId) {
			const subscription = await getJson(`/subscriptions/${subscriptionId}`);
			if (subscription) {
				applyProviderSubscription(userId, subscription, now, subscriptionId);
				applied = true;
				settleCheckout(row.providerTransactionId, 'claim');
				// A claim means the webhook did not arrive. Loud on purpose: this
				// self-heals one customer and hides a destination that is wrong for
				// everybody. /healthz and the administration page count these.
				console.error(
					'billing: claimed a checkout the webhook never delivered —',
					row.providerTransactionId,
					'check the provider notification destination'
				);
				continue;
			}
		}

		// Nothing came of it. Give an abandoned window an hour before writing it
		// off, so a customer who is still typing their card is not dismissed.
		//
		// SQLite's CURRENT_TIMESTAMP is `YYYY-MM-DD HH:MM:SS` in UTC with no zone
		// on it, which Date() is free to read as local time. Made explicit here:
		// an hour's grace that is silently three is not a grace period.
		const stamped = row.createdAt.includes('T')
			? row.createdAt
			: `${row.createdAt.replace(' ', 'T')}Z`;
		const opened = new Date(stamped).getTime();
		const age = Number.isNaN(opened) ? Infinity : now.getTime() - opened;
		const status = String(transaction.status ?? '');
		if (status === 'canceled' || (!subscriptionId && age > 3600_000)) {
			settleCheckout(row.providerTransactionId, 'claim');
		}
	}

	return applied;
}

/**
 * The same question for everybody, on the nightly pass.
 *
 * This is what covers the customer who paid and never came back to the tab.
 */
export async function claimAbandonedCheckouts(now = new Date()): Promise<number> {
	const owners = [...new Set(unsettledCheckouts().map((row) => row.userId))];
	let applied = 0;
	for (const userId of owners) {
		if (await claimCheckouts(userId, now)) applied += 1;
	}
	return applied;
}

/**
 * Checkouts the app had to chase, because nobody told it.
 *
 * Zero is the healthy number. Anything else means the provider's notification
 * destination is not reaching this instance, and every one of those customers
 * saw the pay page after paying until something asked on their behalf.
 */
export function chasedCheckouts(since: Date): number {
	return db
		.select({ id: billingCheckouts.id })
		.from(billingCheckouts)
		.where(
			and(
				eq(billingCheckouts.settledBy, 'claim'),
				gt(billingCheckouts.settledAt, since.toISOString())
			)
		)
		.all().length;
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

/**
 * What a brand-new account is entitled to, decided once at registration.
 *
 * Invited with no end date: the alpha deal — Pro, no billing UI, until the
 * operator changes it. Invited with one: Pro until that moment, paid for by
 * nobody, with the billing pages available throughout so the person can decide
 * to stay before it runs out. Neither spends a free trial: the invitation is
 * instead of the fourteen days, not on top of them.
 *
 * Open registration on a selling instance with card-first trials: nothing yet
 * — the fourteen days start at the provider's checkout, card in hand, and the
 * caller sends the person there. Everything else (an instance that sells but
 * does not require the card, mainly): the internal no-card trial, as before.
 */
export function onboardEntitlement(
	userId: string,
	invite: { grantsUntil: string | null } | null,
	now = new Date()
): 'invited' | 'checkout' | 'trial' {
	if (invite) {
		applySubscription(
			userId,
			{
				plan: 'pro',
				status: 'active',
				provider: 'invited',
				currentPeriodEnd: invite.grantsUntil
			},
			now
		);
		return 'invited';
	}
	if (isBillingConfigured() && pricing().trialRequiresCard) return 'checkout';
	startTrial(userId, now);
	return 'trial';
}

type PriceEntity = {
	description?: string;
	product_id?: string;
	unit_price?: { amount?: string; currency_code?: string };
	billing_cycle?: { interval?: string; frequency?: number } | null;
	trial_period?: { interval?: string; frequency?: number } | null;
};

/** One catalog price, from the provider — the template a returning checkout copies. */
async function priceEntity(id: string): Promise<PriceEntity | null> {
	try {
		const response = await fetch(`${apiBase()}/prices/${id}`, {
			headers: { Authorization: `Bearer ${config().apiKey}` }
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { data?: PriceEntity };
		return body.data ?? null;
	} catch {
		return null;
	}
}

/**
 * The trial the NEXT checkout would carry, for the pages that sell it: the
 * full run for a fresh account, the carried-over remainder for a returning
 * one, zero when there is nothing left to carry.
 */
export function checkoutTrialDays(userId: string): number {
	const { hasHistory, remainingDays } = trialCarryover(userId);
	return hasHistory ? remainingDays : pricing().trialDays;
}

/** Which cycle the standing subscription bills on, asked of the provider. */
export async function currentInterval(userId: string): Promise<'month' | 'year' | null> {
	const standing = activeProviderSubscription(userId);
	if (!standing) return null;
	try {
		const response = await fetch(`${apiBase()}/subscriptions/${standing.subscriptionId}`, {
			headers: { Authorization: `Bearer ${config().apiKey}` }
		});
		if (!response.ok) return null;
		const body = (await response.json()) as {
			data?: { status?: string; items?: { price?: { billing_cycle?: { interval?: string } } }[] };
		};
		const interval = body.data?.items?.[0]?.price?.billing_cycle?.interval;
		return interval === 'year' ? 'year' : interval === 'month' ? 'month' : null;
	} catch {
		return null;
	}
}

/**
 * Move the standing subscription to the other cycle, in place.
 *
 * The one-click upgrade: no cancel-and-rebuy, no second trial. Mid-trial
 * nothing is billed (the new cycle starts when the trial does); on a paid
 * subscription the difference is prorated immediately, which is the honest
 * way to sell an upgrade. The webhook writes the outcome back as always.
 */
export async function changeInterval(
	userId: string,
	interval: 'monthly' | 'yearly'
): Promise<void> {
	const standing = activeProviderSubscription(userId);
	if (!standing) throw new ValidationError('There is no subscription to change');
	const { apiKey, priceMonthly, priceYearly } = config();
	const priceId = interval === 'yearly' ? priceYearly : priceMonthly;
	if (!priceId) throw new ValidationError('This instance does not sell that cycle');

	// The provider's word on trialing, not our row's: a $0 trial payment used
	// to flip the local status to active, and the wrong answer here is a 400.
	let trialing = standing.status === 'trialing';
	try {
		const current = await fetch(`${apiBase()}/subscriptions/${standing.subscriptionId}`, {
			headers: { Authorization: `Bearer ${apiKey}` }
		});
		if (current.ok) {
			const body = (await current.json()) as { data?: { status?: string } };
			trialing = body.data?.status === 'trialing';
		}
	} catch {
		// The PATCH below will say no if this guess is wrong.
	}
	const response = await fetch(`${apiBase()}/subscriptions/${standing.subscriptionId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
		body: JSON.stringify({
			items: [{ price_id: priceId, quantity: 1 }],
			proration_billing_mode: trialing ? 'do_not_bill' : 'prorated_immediately'
		})
	});
	if (!response.ok) {
		console.error('billing: could not change interval', response.status, await response.text());
		throw new ValidationError(
			'The payment provider did not accept the change. Try again in a minute.'
		);
	}

	// The webhook confirms it; this only refreshes what the page shows now.
	const body = (await response.json()) as { data?: Record<string, unknown> };
	const data = body.data ?? {};
	const status = mapStatus(data.status);
	const period = (data.current_billing_period ?? {}) as Record<string, unknown>;
	applySubscription(userId, {
		plan: status === 'expired' ? 'none' : 'pro',
		status,
		provider: PROVIDER,
		providerCustomerId: data.customer_id ? String(data.customer_id) : standing.customerId,
		providerSubscriptionId: String(data.id ?? standing.subscriptionId),
		currentPeriodEnd: iso(period.ends_at ?? data.next_billed_at),
		trialEndsAt: status === 'trialing' ? iso(period.ends_at ?? data.next_billed_at) : null
	});
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
		//
		// It also closes the checkout we wrote down when the payment window
		// opened, so nothing goes looking for an answer it already has.
		if (data.id) settleCheckout(String(data.id), 'webhook');
		const subscriptionId = String(data.subscription_id ?? '');
		const resolved = customUserId ?? userIdFromSubscription(subscriptionId);
		if (!subscriptionId || !resolved) {
			markDone(subscriptionId ? 'no account for this transaction' : undefined);
			return subscriptionId
				? { applied: false, reason: 'unknown_account', event: eventName }
				: { applied: false, reason: 'ignored', event: eventName };
		}

		// Bind only. The subscription events carry the truthful status —
		// a $0 trial payment also "completes", and stamping active over
		// trialing here is how a trial was once told to prorate a switch.
		if (!userIdFromSubscription(subscriptionId)) {
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
		}
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
			cancelAt: change && String(change.action) === 'cancel' ? iso(change.effective_at) : null,
			// A card-first trial lives at the provider; its end is the billing
			// period's end, and the trial-ending mail needs it here.
			trialEndsAt: status === 'trialing' ? iso(period.ends_at ?? data.next_billed_at) : null,
			// Which plan they are actually on, read off what they are paying for.
			// Undefined when the event carries no items, which leaves the number
			// alone rather than shrinking a family plan to one.
			seats: Array.isArray(data.items) ? seatsFromItems(data.items) : undefined
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

	// And before anything is judged unpaid: a checkout whose result never
	// arrived is somebody who paid, and expiring them would be the second
	// insult after showing them the pay page.
	await claimAbandonedCheckouts(now);

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
					cancelAt: change && String(change.action) === 'cancel' ? iso(change.effective_at) : null,
					trialEndsAt: status === 'trialing' ? iso(period.ends_at ?? data.next_billed_at) : null
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
