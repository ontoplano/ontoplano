import { and, count, eq } from 'drizzle-orm';

import {
	LIMIT_LABELS,
	PLANS,
	isPlanId,
	isSubscriptionStatus,
	type LimitKey,
	type PlanId,
	type SubscriptionStatus
} from '../../plans.js';
import { db } from '../db/index.js';
import { apiTokens, dataPoints, dataStreams, subscriptions } from '../db/schema.js';
import { isSelfHosted, pricing } from '../settings.js';
import { record } from './audit.js';
import type { Ctx } from './ctx.js';
import { ForbiddenError } from './errors.js';

/**
 * What an account may do, and until when.
 *
 * Everything asks `resolvePlan`; nothing asks "is this account paying". A
 * self-hosted instance is not a customer at all — it answers Pro, forever, with
 * no billing anywhere in the interface, exactly as the Telegram bot and the
 * deployment settings work.
 */

export type Entitlement = {
	plan: PlanId;
	status: SubscriptionStatus;
	/** Where the answer came from, for a page that has to explain itself. */
	source: 'self-hosted' | 'trial' | 'subscription' | 'lapsed' | 'none';
	/** End of the trial or of the paid period, whichever is running. */
	until: string | null;
	/** True while a cancellation is scheduled and the period is still running. */
	endingAt: string | null;
	/** Whether this instance sells anything at all. */
	billable: boolean;
};

const SELF_HOSTED: Entitlement = {
	plan: 'pro',
	status: 'active',
	source: 'self-hosted',
	until: null,
	endingAt: null,
	billable: false
};

export function resolvePlan(userId: string, now = new Date()): Entitlement {
	if (isSelfHosted()) return SELF_HOSTED;

	const row = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get();
	if (!row) return { ...unsubscribed() };

	const plan = isPlanId(row.plan) ? row.plan : 'none';
	const status = isSubscriptionStatus(row.status) ? row.status : 'expired';
	const nowIso = now.toISOString();

	// A trial that has run out is not a trial, whatever the row still says: the
	// nightly reconcile catches up eventually, and a read must not wait for it.
	if (status === 'trialing') {
		const ends = row.trialEndsAt;
		if (ends && ends > nowIso)
			return {
				plan,
				status,
				source: 'trial',
				until: ends,
				endingAt: null,
				billable: true
			};
		return { ...unsubscribed(), source: 'lapsed' };
	}

	if (status === 'active' || status === 'past_due') {
		const ends = row.currentPeriodEnd;
		// Past due keeps working until the period actually ends; a failed card is
		// usually a card that expired, not a person who left.
		if (!ends || ends > nowIso)
			return {
				plan,
				status,
				source: 'subscription',
				until: ends,
				endingAt: row.cancelAt,
				billable: true
			};
		return { ...unsubscribed(), source: 'lapsed' };
	}

	// Cancelled or expired: the paid period may still be running.
	if (row.currentPeriodEnd && row.currentPeriodEnd > nowIso)
		return {
			plan,
			status,
			source: 'subscription',
			until: row.currentPeriodEnd,
			endingAt: row.cancelAt ?? row.currentPeriodEnd,
			billable: true
		};

	return { ...unsubscribed(), source: 'lapsed' };
}

/**
 * Nobody is paying and nobody is on trial.
 *
 * Not a tier — an account in this state keeps everything it wrote and can still
 * read and export it, because the data is the person's. It just cannot be added
 * to. The free option is self-hosting, which is a different thing entirely.
 */
function unsubscribed(): Entitlement {
	return {
		plan: 'none',
		status: 'expired',
		source: 'none',
		until: null,
		endingAt: null,
		billable: true
	};
}

/**
 * Give a new account its trial.
 *
 * Fourteen days of Pro without a card, because a planner is not something you
 * can judge in an afternoon — the point of it only shows up in the second week.
 */
export function startTrial(userId: string, now = new Date(), actorId?: string): void {
	if (isSelfHosted()) return;

	const existing = db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.get();

	if (existing) return;

	const endsAt = new Date(now.getTime() + pricing().trialDays * 24 * 60 * 60 * 1000).toISOString();

	db.insert(subscriptions)
		.values({
			userId,
			plan: 'pro',
			status: 'trialing',
			provider: 'none',
			trialEndsAt: endsAt,
			currentPeriodEnd: endsAt,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString()
		})
		.run();

	record(userId, 'plan_changed', {
		actorId,
		detail: { to: 'pro', status: 'trialing', until: endsAt }
	});
}

/**
 * Write what the provider says.
 *
 * The webhook is the source of truth: this never decides anything, it only
 * records what came back and audits the change.
 */
export function applySubscription(
	userId: string,
	input: {
		plan: PlanId;
		status: SubscriptionStatus;
		provider: string;
		providerCustomerId?: string | null;
		providerSubscriptionId?: string | null;
		currentPeriodEnd?: string | null;
		cancelAt?: string | null;
	},
	now = new Date()
): void {
	const existing = db
		.select({ id: subscriptions.id, plan: subscriptions.plan, status: subscriptions.status })
		.from(subscriptions)
		.where(eq(subscriptions.userId, userId))
		.get();

	const values = {
		plan: input.plan,
		status: input.status,
		provider: input.provider,
		providerCustomerId: input.providerCustomerId ?? null,
		providerSubscriptionId: input.providerSubscriptionId ?? null,
		currentPeriodEnd: input.currentPeriodEnd ?? null,
		cancelAt: input.cancelAt ?? null,
		updatedAt: now.toISOString()
	};

	if (existing) {
		db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id)).run();
	} else {
		db.insert(subscriptions)
			.values({ userId, ...values, createdAt: now.toISOString() })
			.run();
	}

	if (!existing || existing.plan !== input.plan || existing.status !== input.status)
		record(userId, 'plan_changed', { detail: { to: input.plan, status: input.status } });
}

/** The account a provider subscription belongs to, for a webhook. */
export function userIdForSubscription(provider: string, subscriptionId: string): string | null {
	const row = db
		.select({ userId: subscriptions.userId })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.provider, provider),
				eq(subscriptions.providerSubscriptionId, subscriptionId)
			)
		)
		.get();

	return row?.userId ?? null;
}

// --- Limits -------------------------------------------------------------------

/** How many of a thing this account already has. */
export function usage(userId: string): Record<LimitKey, number> {
	const countOf = (table: typeof apiTokens | typeof dataStreams | typeof dataPoints) =>
		db.select({ n: count() }).from(table).where(eq(table.userId, userId)).get()?.n ?? 0;

	return {
		apiTokens: countOf(apiTokens),
		dataStreams: countOf(dataStreams),
		dataPoints: countOf(dataPoints),
		// Not a stored count: the export log answers this one, and the account
		// service already owns that question.
		exportsPerDay: 0
	};
}

export function limitOf(plan: PlanId, key: LimitKey): number | null {
	return PLANS[plan].limits[key];
}

/**
 * Refuse a create that would go over the plan's ceiling.
 *
 * Called by the service that owns the thing, not by the route: a limit checked
 * in a form is a limit that the API does not have.
 */
export function assertWithinLimit(ctx: Ctx, key: LimitKey, adding = 1): void {
	const entitlement = resolvePlan(ctx.userId, ctx.now);
	const limit = limitOf(entitlement.plan, key);
	if (limit === null) return;

	const current = usage(ctx.userId)[key];
	if (current + adding <= limit) return;

	throw new ForbiddenError(
		`Your plan allows ${limit.toLocaleString('en-US')} ${LIMIT_LABELS[key].toLowerCase()}. ` +
			`Nothing has been deleted — upgrading raises the limit.`
	);
}
