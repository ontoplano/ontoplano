/**
 * What a plan is.
 *
 * An object rather than an `isPro` boolean, because the question is never
 * "is this account paying" — it is "how many of these may it have", and the
 * answer has to be readable in one place when it changes.
 *
 * Limits are counts of things that accumulate. Nothing here limits *use*: a
 * planner that stops working on the 200th block is not a smaller plan, it is a
 * broken one.
 */
export const PLAN_IDS = ['free', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const LIMIT_KEYS = [
	'notebooks',
	'people',
	'apiTokens',
	'dataStreams',
	'exportsPerDay'
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** `null` is no limit. */
export type Plan = {
	id: PlanId;
	label: string;
	blurb: string;
	/** Monthly, in cents, in the currency the provider is configured with. */
	priceCents: number;
	limits: Record<LimitKey, number | null>;
};

export const PLANS: Record<PlanId, Plan> = {
	free: {
		id: 'free',
		label: 'Free',
		blurb: 'The whole planner, with a ceiling on the things that pile up.',
		priceCents: 0,
		limits: {
			notebooks: 3,
			people: 25,
			apiTokens: 1,
			dataStreams: 2,
			exportsPerDay: 2
		}
	},
	pro: {
		id: 'pro',
		label: 'Pro',
		blurb: 'The same planner without the ceilings, and more room to plug things into it.',
		priceCents: 500,
		limits: {
			notebooks: null,
			people: null,
			apiTokens: 20,
			dataStreams: 50,
			exportsPerDay: 10
		}
	}
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
	notebooks: 'Notebooks',
	people: 'People',
	apiTokens: 'API tokens',
	dataStreams: 'Data streams',
	exportsPerDay: 'Exports per day'
};

/** How a subscription is doing, in the provider's vocabulary. */
export const SUBSCRIPTION_STATUSES = [
	'trialing',
	'active',
	'past_due',
	'canceled',
	'expired'
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isPlanId(value: unknown): value is PlanId {
	return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
	return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/** Days a new account gets on Pro without being asked for a card. */
export const TRIAL_DAYS = 14;

export function formatPrice(cents: number): string {
	return cents === 0 ? 'free' : `$${(cents / 100).toFixed(2)}/month`;
}
