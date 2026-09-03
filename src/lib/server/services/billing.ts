import type { Pricing, SubscriptionStatus } from '../../plans.js';
import { provider } from '../billing/index.js';
import type { PlanTier } from '../billing/contract.js';
import { isSelfHosted, pricing } from '../settings.js';
import { applySubscription, startTrial, trialCarryover } from './subscriptions.js';
import { ServiceError } from './errors.js';

/**
 * Billing, as the rest of the app sees it.
 *
 * Every name here is the name it always had, and every caller is unchanged —
 * what moved is where the answers come from. The payment provider is behind
 * `../billing/`: an interface this repository ships, and an implementation it
 * does not. See `../billing/contract.ts` for why.
 *
 * Two things stayed on this side, because they were never about a provider:
 *
 *  - **`onboardEntitlement`** decides what a brand-new account gets — an
 *    invitation's grant, a checkout, or a trial. Only one of its three answers
 *    involves money at all.
 *  - **`checkoutTrialDays`** is arithmetic over this account's own history.
 *
 * And everything about *entitlement* — the plan, the seats, the limits — is in
 * `subscriptions.ts` and never left. A self-hoster still has all of it; what
 * they no longer have in their copy of this repository is somebody else's
 * merchant integration.
 */

export type { PlanTier } from '../billing/contract.js';
export type { WebhookOutcome } from '../billing/contract.js';

/** Stored on a subscription row, so the row says who charged for it. */
export const PROVIDER: string = provider().name;

/** The header the provider signs its webhooks with. */
export const SIGNATURE_HEADER: string = provider().signatureHeader;

/** Whether this instance can actually sell anything. */
export function isBillingConfigured(): boolean {
	// Whether it means to sell comes first and does not depend on the provider:
	// a build with a payment integration compiled into it is still a build a
	// self-hoster can run, and running it is not agreeing to sell anything.
	if (!instanceSells()) return false;
	return provider().configured();
}

/** What the price is, asked of the thing that will charge it. */
export function displayPricing(): Promise<Pricing> {
	if (!isBillingConfigured()) return Promise.resolve(pricing());
	return provider().pricing();
}

/** The token the checkout page needs, when there is a provider with a widget. */
export function checkoutClientConfig() {
	return provider().clientConfig();
}

/** Whether there is a yearly price to switch to. */
export function hasYearlyPrice(): boolean {
	return provider().hasYearlyPrice();
}

/**
 * Open a checkout, and answer with the provider's id for it.
 *
 * That id is what the browser carries to the checkout page and what the webhook
 * will name later, which is how a payment finds its way back to an account even
 * when the webhook is the thing that failed.
 */
export function createCheckout(
	userId: string,
	interval: 'monthly' | 'yearly' = 'monthly',
	tier: PlanTier = 'solo'
): Promise<string> {
	return provider().createCheckout(userId, interval, tier);
}

export function portalUrl(userId: string): Promise<string | null> {
	return provider().portalUrl(userId);
}

export function verifySignature(rawBody: string, signature: string | null, now?: Date): boolean {
	return provider().verifySignature(rawBody, signature, now);
}

export function handleWebhook(rawBody: string, fallbackId: string, now?: Date) {
	return provider().handleWebhook(rawBody, fallbackId, now);
}

export function currentInterval(userId: string): Promise<'month' | 'year' | null> {
	return provider().currentInterval(userId);
}

export function changeInterval(userId: string, interval: 'monthly' | 'yearly'): Promise<void> {
	return provider().changeInterval(userId, interval);
}

export function claimCheckouts(userId: string, now?: Date): Promise<boolean> {
	return provider().claimCheckouts(userId, now);
}

export function claimAbandonedCheckouts(now?: Date): Promise<number> {
	return provider().claimAbandonedCheckouts(now);
}

export function hasUnsettledCheckout(userId: string): boolean {
	return provider().hasUnsettledCheckout(userId);
}

export function chasedCheckouts(since: Date): number {
	return provider().chasedCheckouts(since);
}

export function reconcile(now?: Date) {
	return provider().reconcile(now);
}

export function sendTrialEndingNotices(now?: Date): Promise<number> {
	return provider().sendTrialEndingNotices(now);
}

export function mapStatus(raw: unknown): SubscriptionStatus {
	return provider().mapStatus(raw);
}

/**
 * The trial the next checkout would carry.
 *
 * The full run for a fresh account, whatever is left of one for a returning
 * account, and zero when there is nothing left to carry. This account's own
 * history, so no provider is asked.
 */
export function checkoutTrialDays(userId: string): number {
	const { hasHistory, remainingDays } = trialCarryover(userId);
	return hasHistory ? remainingDays : pricing().trialDays;
}

/**
 * Whether this instance is *meant* to sell, whatever it can currently do.
 *
 * `isBillingConfigured()` answers "can a checkout be opened right now", which
 * is a different question and the one that was quietly wrong. An instance that
 * intends to charge and cannot — the provider absent from the build, a price id
 * unset, a key that never made it into the environment — looks from in here
 * exactly like somebody's own copy running for free. And the code did the
 * friendly thing with that ambiguity: it started a fourteen-day trial and said
 * nothing, for every account, for as long as nobody looked.
 *
 * ## Selling is declared, and nothing else implies it
 *
 * The first attempt at this read "not self-hosted" as "sells", which is wrong
 * in the direction that matters: almost every copy of this app is somebody's
 * own, most of them never set `ONTOPLANO_SELF_HOST` because they have no reason
 * to, and the refusal below would have met them on their first registration.
 * The overwhelmingly common instance must be the one that needs no
 * configuration at all.
 *
 * So there is one variable and it is opt-in: `ONTOPLANO_SELLS=true`. An
 * instance that says it sells and cannot is broken and says so; an instance
 * that never mentions money is a personal one and gets on with it.
 */
export function instanceSells(): boolean {
	if (isSelfHosted()) return false;
	return process.env.ONTOPLANO_SELLS === 'true';
}

/**
 * What is stopping this instance selling, if anything.
 *
 * For the administration page and for the refusal below, which need the same
 * answer in two registers — a sentence to show somebody, and a reason to stop.
 * Null means it can sell.
 */
export function whyItCannotSell(): string | null {
	if (!instanceSells()) return null;

	const billing = provider();
	if (billing.configured()) return null;

	/*
	 * Say which settings, when the provider can name them.
	 *
	 * The first version of this said "no working payment provider" and stopped,
	 * which is a sentence that ends in somebody reading the source at eleven at
	 * night to discover that one of four variables was empty. What an operator
	 * needs is the name to grep for.
	 */
	const lacking = billing.missing?.() ?? [];
	if (lacking.length > 0) {
		return `This instance is set up to charge and cannot: ${lacking.join(', ')} ${
			lacking.length === 1 ? 'is' : 'are'
		} not set. Until then no card can be taken and nobody can register.`;
	}

	if (billing.name === 'none') {
		return 'This instance is set up to charge and this build has no payment provider in it at all. Either add one, or unset ONTOPLANO_SELLS.';
	}

	return 'This instance is set up to charge, and its payment provider is not working — so no card can be taken.';
}

/**
 * What this instance can do about money, in three fields.
 *
 * For `/healthz`, and through it for the deploy: the payment provider is copied
 * into the tree at build time from a checkout that lives outside this
 * repository, so a build made on a machine without that checkout produces an
 * app that cannot sell and looks exactly like one that can. The only place that
 * difference is visible is inside the running process, which is here.
 */
export function billingStatus(): {
	sells: boolean;
	provider: string;
	missing: string[];
	ready: boolean;
} {
	const billing = provider();
	return {
		sells: instanceSells(),
		provider: billing.name,
		missing: billing.configured() ? [] : (billing.missing?.() ?? []),
		ready: isBillingConfigured()
	};
}

/**
 * What a brand-new account is entitled to, before it has paid anything.
 *
 * Three answers and only one of them is about money: an invitation hands over
 * a grant outright, an instance that sells sends them to a checkout, and a
 * self-hosted instance starts a trial because nothing there charges for
 * anything.
 *
 * ## Why the fourth case throws
 *
 * There used to be no fourth case. An instance that sells but cannot fell
 * through to `startTrial` — the same branch as a self-hosted copy — so a
 * misconfigured production instance handed every new account fourteen free
 * days, silently, for as long as nobody looked. Nothing on any page said so,
 * because from the app's point of view nothing was wrong.
 *
 * The failure has to be loud and it has to be *early*: refusing registration on
 * an instance that cannot charge costs the operator the accounts that would
 * have signed up in the minutes before they notice; the alternative costs them
 * the money from every account that ever signs up, and they find out months
 * later. Existing accounts are untouched, and `/admin` can still grant a trial
 * by hand for anybody who needs one.
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

	const broken = whyItCannotSell();
	// 503 rather than 400: nothing the person typed is wrong, and the operator
	// is the one who has to act. A monitor watching status codes sees it too.
	if (broken) throw new ServiceError('internal', 503, broken);

	startTrial(userId, now);
	return 'trial';
}
