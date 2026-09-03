import type { Pricing, SubscriptionStatus } from '../../plans.js';
import { provider } from '../billing/index.js';
import type { PlanTier } from '../billing/contract.js';
import { isSelfHosted, pricing } from '../settings.js';
import { applySubscription, startTrial, trialCarryover } from './subscriptions.js';

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
	// Self-hosting is the one answer that does not depend on the provider: an
	// instance somebody runs for themselves does not sell, whatever is compiled
	// into it. Kept here rather than asked of the provider so that a build with
	// a provider in it is still a build a self-hoster can run.
	if (isSelfHosted()) return false;
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
 * What a brand-new account is entitled to, before it has paid anything.
 *
 * Three answers and only one of them is about money: an invitation hands over
 * a grant outright, an instance that sells sends them to a checkout, and
 * anything else starts a trial. On a self-hosted instance the middle answer
 * never happens, which is why this reads `isBillingConfigured()` rather than
 * asking the provider directly.
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
