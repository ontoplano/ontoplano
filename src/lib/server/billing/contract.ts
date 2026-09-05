import type { Pricing, SubscriptionStatus } from '../../plans.js';

/**
 * What a billing provider has to be able to do, and nothing about who it is.
 *
 * ## Why this file exists
 *
 * This repository is public, and until now it shipped the whole of a payment
 * integration in the open: the provider's API calls, its webhook format, its
 * signature scheme, the price ids. None of that is a secret — no keys were ever
 * in here, and that was checked — but it is *ours* rather than the software's.
 * Somebody who clones this to run their own instance is reading the plumbing of
 * a business they are not part of, and the first thing they have to work out is
 * which half of the app is for them.
 *
 * Vikunja solves this by having no payment code in the public repo at all. This
 * is the same idea with the seam written down: the app knows there is *a*
 * provider and what it can be asked, and the answer to "which one" is not in
 * this repository.
 *
 * ## What did NOT move
 *
 * Everything about **entitlement** stays here, in `services/subscriptions.ts`:
 * which plan an account is on, when its trial ends, how many seats it has, and
 * every limit that follows. That is product — a family instance somebody runs
 * themselves still has seats — and it is the part that has to sit next to the
 * data it gates. What left is only the part that talks to a company about money.
 *
 * ## When there is no provider
 *
 * `none.ts` is the answer, and it is not a stub for the sake of it: an instance
 * with no payment provider is the ordinary case. Every self-hosted copy is one,
 * every development machine is one, and the app has to be completely usable as
 * one — which is why `configured()` returning false is a supported state rather
 * than a misconfiguration.
 */

/** Which of the two plans is being bought. */
export type PlanTier = 'solo' | 'family';

/** What the browser needs to open a checkout, if the provider has a widget. */
export type ClientConfig = {
	token: string;
	environment: 'sandbox' | 'production';
};

/**
 * What the app does about one thing the provider said.
 *
 * The shape the webhook route already answers with — a boolean and, when it did
 * nothing, why. Kept exactly as it was rather than tidied: the route, its tests
 * and the operations log all read these fields.
 */
export type WebhookOutcome =
	| { applied: true; userId: string; event: string }
	| { applied: false; reason: 'duplicate' | 'ignored' | 'unknown_account'; event: string };

export interface BillingProvider {
	/** Stored on the subscription row, so a row says who charged for it. */
	readonly name: string;

	/** The header the provider signs its webhooks with. */
	readonly signatureHeader: string;

	/** Whether this instance can actually sell anything. */
	configured(): boolean;

	/**
	 * Whether the provider is talking to a TEST environment — Paddle's
	 * sandbox, a stripe test key, whatever the provider calls play money.
	 * Optional: a provider that cannot tell says nothing, and the app treats
	 * that as real. A selling production instance where this is true is a
	 * shop taking toy payments, which the admin page and the deploy both
	 * shout about.
	 */
	sandbox?(): boolean;

	/**
	 * What it is short of, when it cannot.
	 *
	 * Names of settings, in the spelling an operator would grep for. `configured()`
	 * answering false is a fact nobody can act on: "no working payment provider"
	 * sent somebody to read this repository at eleven at night to find out that
	 * one of four variables was empty. Optional, because a provider is allowed
	 * to be configured by something other than variables — absent, the app says
	 * the general thing it used to say.
	 */
	missing?(): string[];

	/** The token a page needs to open the provider's own checkout, if any. */
	clientConfig(): ClientConfig | null;

	/**
	 * The origins `/buy` has to be allowed to reach, if the provider has a widget.
	 *
	 * An overlay checkout is the provider's script on our page framing their
	 * domain, so the one page that opens it needs a wider content-security-policy
	 * than the rest of the app. Which domains those are is the provider's own
	 * knowledge; `hooks.server.ts` asks rather than naming any. Absent means the
	 * page widens nothing.
	 */
	checkoutOrigins?(): { script: string; connect: string; frame: string } | null;

	/**
	 * What the price *is*, asked of the thing that charges it.
	 *
	 * The numbers in the instance's settings are what it quotes before it sells;
	 * this is what the customer will actually be charged, and the two are
	 * allowed to disagree only until somebody notices.
	 */
	pricing(): Promise<Pricing>;

	/** Whether a yearly price exists to switch to. */
	hasYearlyPrice(): boolean;

	/**
	 * Open a checkout, and write down that it was opened.
	 *
	 * Answers with the provider's transaction id, which is what the browser
	 * carries to the checkout page and what the webhook will name later.
	 */
	createCheckout(userId: string, interval?: 'monthly' | 'yearly', tier?: PlanTier): Promise<string>;

	/** A link to the provider's own "manage my card" page, if it has one. */
	portalUrl(userId: string): Promise<string | null>;

	/** Is this webhook really from the provider, and recent? */
	verifySignature(rawBody: string, signature: string | null, now?: Date): boolean;

	/** Apply one webhook, exactly once. `fallbackId` names it if the body does not. */
	handleWebhook(rawBody: string, fallbackId: string, now?: Date): WebhookOutcome;

	/** Which billing interval this account is on right now. */
	currentInterval(userId: string): Promise<'month' | 'year' | null>;

	/** Move an account between monthly and yearly. */
	changeInterval(userId: string, interval: 'monthly' | 'yearly'): Promise<void>;

	/** Ask the provider about checkouts nobody heard back about. */
	claimCheckouts(userId: string, now?: Date): Promise<boolean>;
	claimAbandonedCheckouts(now?: Date): Promise<number>;
	hasUnsettledCheckout(userId: string): boolean;
	chasedCheckouts(since: Date): number;

	/** The nightly pass: make our rows agree with the provider's. */
	reconcile(now?: Date): Promise<{ expired: number; checked: number; noticed: number }>;

	/** Warn people before the first charge. */
	sendTrialEndingNotices(now?: Date): Promise<number>;

	/** Translate the provider's word for a subscription's state into ours. */
	mapStatus(raw: unknown): SubscriptionStatus;
}
