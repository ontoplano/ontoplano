import type { Pricing, SubscriptionStatus } from '../../plans.js';
import { pricing } from '../settings.js';
import type { BillingProvider, ClientConfig, WebhookOutcome } from './contract.js';

/**
 * An instance that takes no money, which is most of them.
 *
 * Every self-hosted copy, every development machine and every fork is one of
 * these, so this is the ordinary case rather than a stub standing in for the
 * real thing. It answers every question honestly — there is no provider, the
 * prices are whatever the settings quote, no checkout can be opened — and it
 * throws only where a caller has already been told not to call.
 *
 * The pages that sell are already written to disappear when `configured()` is
 * false, so nothing here should ever be reached from the UI. It refuses loudly
 * anyway: a silent no from a payment path is how somebody ends up believing
 * they have paid.
 */
class NoBilling implements BillingProvider {
	readonly name = 'none';
	readonly signatureHeader = 'x-no-billing';

	configured(): boolean {
		return false;
	}

	clientConfig(): ClientConfig | null {
		return null;
	}

	async pricing(): Promise<Pricing> {
		// What the instance quotes, since nothing is going to charge it.
		return pricing();
	}

	hasYearlyPrice(): boolean {
		return false;
	}

	async createCheckout(): Promise<string> {
		throw new Error('This instance takes no payments.');
	}

	async portalUrl(): Promise<string | null> {
		return null;
	}

	verifySignature(): boolean {
		// Nothing signed it, so nothing verifies. A webhook arriving here is
		// somebody probing, and the route answers 400.
		return false;
	}

	handleWebhook(): WebhookOutcome {
		return { applied: false, reason: 'ignored', event: 'none' };
	}

	async currentInterval(): Promise<'month' | 'year' | null> {
		return null;
	}

	async changeInterval(): Promise<void> {
		throw new Error('This instance takes no payments.');
	}

	async claimCheckouts(): Promise<boolean> {
		return false;
	}

	async claimAbandonedCheckouts(): Promise<number> {
		return 0;
	}

	hasUnsettledCheckout(): boolean {
		return false;
	}

	chasedCheckouts(): number {
		return 0;
	}

	async reconcile(): Promise<{ expired: number; checked: number; noticed: number }> {
		return { expired: 0, checked: 0, noticed: 0 };
	}

	async sendTrialEndingNotices(): Promise<number> {
		return 0;
	}

	mapStatus(): SubscriptionStatus {
		return 'active';
	}
}

export const noBilling = new NoBilling();
