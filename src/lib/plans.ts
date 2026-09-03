/**
 * What a plan is.
 *
 * There is one, and there is self-hosting.
 *
 * The old shape had a free tier with ceilings — three notebooks, twenty-five
 * people — which existed to make it uncomfortable enough to pay. That is the
 * standard model and it is the wrong one here, for two reasons. A hard paywall
 * converts about five times better than freemium in this category, and, more
 * to the point, *this app already has a free tier and it is a better one than
 * any competitor's*: the source is open and it self-hosts. Free means you run
 * it; paid means somebody else does.
 *
 * So the ceilings that survive are about abuse rather than tiering — an export
 * is expensive to generate and an API token is a key. Nothing here limits the
 * planner itself: a planner that stops working on the 200th block is not a
 * smaller plan, it is a broken one.
 */
export const PLAN_IDS = ['none', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const LIMIT_KEYS = ['apiTokens', 'dataStreams', 'dataPoints', 'exportsPerDay'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** `null` is no limit. */
export type Plan = {
	id: PlanId;
	label: string;
	blurb: string;
	limits: Record<LimitKey, number | null>;
};

export const PLANS: Record<PlanId, Plan> = {
	/**
	 * Not a tier. What an account is when nobody is paying and nobody is on
	 * trial: it can still be read and exported, because the data is the
	 * person's, but it cannot be added to.
	 */
	none: {
		id: 'none',
		label: 'Not subscribed',
		blurb: 'Everything you wrote is still here, and still exportable.',
		limits: {
			apiTokens: 0,
			dataStreams: 0,
			dataPoints: 0,
			exportsPerDay: 2
		}
	},
	pro: {
		id: 'pro',
		label: 'Ontoplano',
		blurb: 'The whole thing, hosted, backed up and kept running.',
		limits: {
			apiTokens: 20,
			dataStreams: 50,
			/*
			 * The storage ceiling. Rate limits bound requests, not rows: a producer
			 * inside its write budget can add 86,400 points a day forever, and this
			 * is the number that stops that from being how the disk fills. A million
			 * points is on the order of 150MB — years of any sane producer — so
			 * nobody hits it by using the app; a runaway hits it in weeks instead of
			 * taking the instance down.
			 */
			dataPoints: 1_000_000,
			exportsPerDay: 10
		}
	}
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
	apiTokens: 'API tokens',
	dataStreams: 'Data streams',
	dataPoints: 'Stored data points',
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

/**
 * What the subscription costs and how the trial runs.
 *
 * Set by whoever runs the instance rather than compiled in, because a price is
 * not a fact about the software. The defaults are the ones argued for in
 * `notes/competition-studies/pricing.md`: the three closest competitors all sit
 * between $20 and $30 a year, and fourteen days is the shortest trial that can
 * contain two weekly reviews — which is the loop the whole app is built around.
 */
export type Pricing = {
	/** Monthly, in cents, in `currency`. */
	monthlyCents: number;
	/** A year, in cents. Zero hides the annual option. */
	yearlyCents: number;
	/**
	 * The family rate, covering `familySeats` accounts on one invoice.
	 *
	 * Zero means this instance does not sell one, which is the honest default
	 * for a self-hosted box and for an operator who has not set the price up
	 * with their provider.
	 */
	familyMonthlyCents: number;
	familyYearlyCents: number;
	familySeats: number;
	currency: string;
	trialDays: number;
	/** Whether the trial asks for a card up front. */
	trialRequiresCard: boolean;
	/** Named on the terms page, because a merchant of record has to be. */
	provider: string;
};

/**
 * What an instance quotes before the provider has told it otherwise.
 *
 * One rate and one discount: a month costs what it costs, a family is a bigger
 * number for up to five accounts, and a year is the same thing 30% off. The
 * yearly figures are derived rather than typed, so the discount cannot drift
 * from the sentence describing it.
 */
export const YEARLY_DISCOUNT = 0.3;

/** The one number to change, and the one to change beside it. */
const MONTHLY_CENTS = 500;
const FAMILY_MONTHLY_CENTS = 1200;

/** A year at the monthly rate, less the discount, to the cent. */
export const yearlyOf = (monthlyCents: number) =>
	Math.round(monthlyCents * 12 * (1 - YEARLY_DISCOUNT));

export const DEFAULT_PRICING: Pricing = {
	monthlyCents: MONTHLY_CENTS,
	yearlyCents: yearlyOf(MONTHLY_CENTS),
	familyMonthlyCents: FAMILY_MONTHLY_CENTS,
	familyYearlyCents: yearlyOf(FAMILY_MONTHLY_CENTS),
	/** How many accounts one family subscription covers, the payer included. */
	familySeats: 5,
	currency: 'USD',
	trialDays: 14,
	trialRequiresCard: true,
	provider: ''
};

export function formatPrice(cents: number, currency = 'USD'): string {
	const symbol = currency === 'USD' ? '$' : `${currency} `;
	return `${symbol}${(cents / 100).toFixed(2)}`;
}

/** "$30.00 a year — $2.50 a month" and the saving, for the one place it is sold. */
export function describeYearly(pricing: Pricing): string | null {
	if (pricing.yearlyCents <= 0 || pricing.monthlyCents <= 0) return null;

	const perMonth = pricing.yearlyCents / 12;
	const saving = Math.round((1 - perMonth / pricing.monthlyCents) * 100);

	return `${formatPrice(pricing.yearlyCents, pricing.currency)} a year — ${formatPrice(
		Math.round(perMonth),
		pricing.currency
	)} a month, ${saving}% off`;
}
