import { createHmac, timingSafeEqual } from 'node:crypto';

import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { isPlanId, type PlanId, type SubscriptionStatus } from '../../plans.js';
import { db } from '../db/index.js';
import { billingEvents, subscriptions } from '../db/schema.js';
import { user } from '../db/auth.schema.js';
import { isSelfHosted } from '../settings.js';
import { applySubscription } from './subscriptions.js';
import { ValidationError } from './errors.js';

/**
 * Lemon Squeezy, and the rules for talking to it.
 *
 * They are merchant of record, which is the whole reason: a solo founder
 * selling worldwide does not want to be the one who owes VAT in twenty
 * countries.
 *
 * Three rules, and they are the ones that make billing survivable:
 *
 *  - The webhook is the source of truth. Nothing in the app decides that
 *    somebody has paid; it only records what the provider said.
 *  - Every webhook is verified and stored by the provider's own event id, so a
 *    retry — and they do retry — is applied exactly once.
 *  - A nightly pass catches what webhooks missed, because a webhook that never
 *    arrived leaves no trace to notice.
 */

export const PROVIDER = 'lemonsqueezy';

/** The signature header Lemon Squeezy sends. */
export const SIGNATURE_HEADER = 'x-signature';

type Config = {
	checkoutUrl: string;
	webhookSecret: string;
	apiKey: string;
};

function config(): Config {
	return {
		checkoutUrl: process.env.LEMONSQUEEZY_CHECKOUT_URL ?? '',
		webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '',
		apiKey: process.env.LEMONSQUEEZY_API_KEY ?? ''
	};
}

/** Whether this instance can actually sell anything. */
export function isBillingConfigured(): boolean {
	if (isSelfHosted()) return false;
	const { checkoutUrl, webhookSecret } = config();
	return checkoutUrl !== '' && webhookSecret !== '';
}

/**
 * Where to send somebody who wants to pay.
 *
 * The account id rides along as custom data, which is what a webhook matches
 * on: the address on the receipt is the provider's business and may not be the
 * one they signed in with.
 */
export function checkoutUrl(userId: string): string | null {
	const { checkoutUrl: base } = config();
	if (!isBillingConfigured()) return null;

	const url = new URL(base);
	url.searchParams.set('checkout[custom][user_id]', userId);

	const account = db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
	if (account) url.searchParams.set('checkout[email]', account.email);

	return url.toString();
}

/** Where an existing customer manages their own card, as the provider told us. */
export function portalUrl(userId: string): string | null {
	const row = db
		.select({ portalUrl: subscriptions.portalUrl })
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.get();

	return row?.portalUrl ?? null;
}

/**
 * Is this really from them?
 *
 * HMAC-SHA256 of the raw body with the webhook secret, compared in constant
 * time. The *raw* body: re-serialising the JSON first would change a byte
 * somewhere and the comparison would fail for a reason nobody could see.
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
	const { webhookSecret } = config();
	if (!webhookSecret || !signature) return false;

	const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
	const given = signature.trim();

	if (expected.length !== given.length) return false;
	return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
}

/** What Lemon Squeezy's statuses mean here. */
export function mapStatus(raw: unknown): SubscriptionStatus {
	switch (String(raw)) {
		case 'on_trial':
			return 'trialing';
		case 'active':
			return 'active';
		case 'past_due':
		case 'unpaid':
			return 'past_due';
		case 'cancelled':
			return 'canceled';
		case 'expired':
			return 'expired';
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
 */
export function handleWebhook(rawBody: string, eventId: string, now = new Date()): WebhookOutcome {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		throw new ValidationError('Body is not JSON');
	}

	const meta = (payload.meta ?? {}) as Record<string, unknown>;
	const eventName = String(meta.event_name ?? '');
	const custom = (meta.custom_data ?? {}) as Record<string, unknown>;

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

	if (!eventName.startsWith('subscription_')) {
		markDone();
		return { applied: false, reason: 'ignored', event: eventName };
	}

	const data = (payload.data ?? {}) as Record<string, unknown>;
	const attributes = (data.attributes ?? {}) as Record<string, unknown>;
	const urls = (attributes.urls ?? {}) as Record<string, unknown>;

	const userId = typeof custom.user_id === 'string' ? custom.user_id : null;
	const resolved = userId ?? userIdFromSubscription(String(data.id ?? ''));

	if (!resolved) {
		markDone('no account for this subscription');
		return { applied: false, reason: 'unknown_account', event: eventName };
	}

	const status = mapStatus(attributes.status);
	// Cancelled but still inside the paid period is still Pro: the provider
	// keeps `ends_at` for exactly that.
	const plan: PlanId = isPlanId(custom.plan) ? custom.plan : 'pro';

	applySubscription(
		resolved,
		{
			plan: status === 'expired' ? 'none' : plan,
			status,
			provider: PROVIDER,
			providerCustomerId: attributes.customer_id ? String(attributes.customer_id) : null,
			providerSubscriptionId: String(data.id ?? ''),
			currentPeriodEnd: iso(attributes.renews_at ?? attributes.ends_at),
			cancelAt: attributes.cancelled ? iso(attributes.ends_at) : null
		},
		now
	);

	if (typeof urls.customer_portal === 'string')
		db.update(subscriptions)
			.set({ portalUrl: urls.customer_portal })
			.where(eq(subscriptions.userId, resolved))
			.run();

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
export async function reconcile(now = new Date()): Promise<{ expired: number; checked: number }> {
	const nowIso = now.toISOString();

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
	if (!apiKey) return { expired: lapsed.length, checked: 0 };

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
			const response = await fetch(
				`https://api.lemonsqueezy.com/v1/subscriptions/${row.providerSubscriptionId}`,
				{
					headers: {
						Accept: 'application/vnd.api+json',
						Authorization: `Bearer ${apiKey}`
					}
				}
			);

			if (!response.ok) continue;

			const body = (await response.json()) as Record<string, unknown>;
			const data = (body.data ?? {}) as Record<string, unknown>;
			const attributes = (data.attributes ?? {}) as Record<string, unknown>;
			const status = mapStatus(attributes.status);

			applySubscription(
				row.userId,
				{
					plan: status === 'expired' ? 'none' : 'pro',
					status,
					provider: PROVIDER,
					providerCustomerId: attributes.customer_id ? String(attributes.customer_id) : null,
					providerSubscriptionId: String(data.id ?? row.providerSubscriptionId),
					currentPeriodEnd: iso(attributes.renews_at ?? attributes.ends_at),
					cancelAt: attributes.cancelled ? iso(attributes.ends_at) : null
				},
				now
			);

			checked += 1;
		} catch (e) {
			console.error('billing: could not reconcile', row.providerSubscriptionId, e);
		}
	}

	return { expired: lapsed.length, checked };
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
