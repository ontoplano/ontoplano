import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { LIMIT_KEYS, PLANS } from '$lib/plans';
import { isSelfHosted } from '$lib/server/settings';
import { buildCtx } from '$lib/server/services/ctx';
import { exportAllowance } from '$lib/server/services/account';
import { resolvePlan, seatsFor, usage } from '$lib/server/services/subscriptions';
import {
	changeInterval,
	checkoutTrialDays,
	createCheckout,
	currentInterval,
	displayPricing,
	hasYearlyPrice,
	portalUrl,
	isBillingConfigured
} from '$lib/server/services/billing';
import { activeProviderSubscription } from '$lib/server/services/subscriptions';
import { RateLimitedError } from '$lib/server/services/errors';
import { toActionFailure } from '$lib/server/http-errors';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * What this account is on, and what it is using.
 *
 * A self-hosted instance sells nothing, so the page says so and stops — the
 * same answer the Telegram bot and the deployment settings give.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	const entitlement = resolvePlan(ctx.userId, ctx.now);

	if (!entitlement.billable && !isSelfHosted()) error(404, 'Not found');

	const counts = usage(ctx.userId);
	counts.exportsPerDay =
		(PLANS[entitlement.plan].limits.exportsPerDay ?? 0) - exportAllowance(ctx.userId).remaining;

	// A self-hosted instance sells nothing, so this page is not there at all.
	// Somebody running the software on their own machine who is shown "Upgrade
	// to Pro" has just been told the free version is a demo. It is not.
	if (isSelfHosted()) error(404, 'Not found');

	// A card on file changes everything the page offers: no buy buttons (a
	// second subscription is a billing dispute, not an upsell), a manage link,
	// and the one honest upgrade — switching cycle in place.
	const standing = activeProviderSubscription(ctx.userId);
	const seats = seatsFor(ctx.userId);
	const interval = standing ? await currentInterval(ctx.userId) : null;

	return {
		entitlement,
		pricing: await displayPricing(),
		configured: isBillingConfigured(),
		plans: Object.values(PLANS).filter((p) => p.id === 'pro'),
		limitKeys: LIMIT_KEYS,
		usage: counts,
		// A provider mints a checkout per transaction, so buying is an action, not
		// a link — and only for an account with no live subscription. A
		// cancelled one still running its period may buy again; the checkout
		// itself carries over whatever trial is left instead of a fresh one.
		canCheckout: !standing,
		trialDaysAhead: checkoutTrialDays(ctx.userId),
		hasProviderSub: Boolean(standing),
		interval,
		yearly: hasYearlyPrice(),
		// How many accounts this subscription covers. Who they are is the Family
		// tab's business now.
		seats,
		/*
		 * Which of the two rates this account is actually on.
		 *
		 * The page used to quote `pricing.yearlyCents` whatever the plan was, so
		 * a household paying the family rate was told its subscription cost the
		 * solo price — and the "switch to yearly" button offered a saving that
		 * was not theirs. The seat count is the fact: a family plan is the same
		 * subscription with more seats on it.
		 */
		tier: (seats > 1 ? 'family' : 'solo') as 'solo' | 'family',
		// A fresh portal session per look: the links carry a short-lived token
		// and the provider says not to store them.
		portal: standing ? await portalUrl(ctx.userId) : null
	};
};

export const actions: Actions = {
	checkout: async ({ request, locals }) => {
		const formData = await request.formData();
		const interval = formData.get('interval') === 'yearly' ? 'yearly' : 'monthly';
		const tier = formData.get('tier') === 'family' ? 'family' : 'solo';
		let url: string;
		try {
			url = await createCheckout(locals.user!.id, interval, tier);
		} catch (e) {
			return toActionFailure(e);
		}
		redirect(303, url);
	},
	switchInterval: async ({ request, locals }) => {
		const formData = await request.formData();
		const interval = formData.get('interval') === 'monthly' ? 'monthly' : 'yearly';
		try {
			// Twice a day: every switch moves real billing and sends provider
			// mail, and flipping back and forth is a spam machine, not a plan.
			const budget = rateLimit(`billing-switch:${locals.user!.id}`, 2, 24 * 60 * 60 * 1000);
			if (!budget.allowed) {
				throw new RateLimitedError(
					'You have already switched twice today. You can switch again tomorrow.'
				);
			}
			await changeInterval(locals.user!.id, interval);
		} catch (e) {
			return toActionFailure(e);
		}
		return { switched: interval };
	}
};
