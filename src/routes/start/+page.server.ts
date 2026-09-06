import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	checkoutTrialDays,
	createCheckout,
	playConfigured,
	displayPricing,
	hasYearlyPrice,
	isBillingConfigured
} from '$lib/server/services/billing';
import { paymentHoldFor } from '$lib/server/services/access';
import { exportAllowance } from '$lib/server/services/account';
import { toActionFailure } from '$lib/server/http-errors';
import { forgetWantedPlan, wantedPlan } from '$lib/server/services/plan-intent';

/**
 * The card step of the funnel: register → confirm → here.
 *
 * The billing-hold gate in hooks.server.ts routes a verified account with no
 * plan yet to this page, so the terms are read BEFORE any payment window
 * opens — /buy is just the overlay's backdrop. Yearly leads; it is the one
 * worth taking.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) redirect(302, '/login');
	if (!isBillingConfigured()) error(404, 'Not found');
	const hold = paymentHoldFor(locals.user.id);
	if (!hold) redirect(302, '/settings/billing');

	const pricing = await displayPricing();
	// A first account gets the full trial; a returning one only what it has
	// left of it — usually nothing, in which case renewing bills today.
	const trialDaysAhead = checkoutTrialDays(locals.user.id);
	return {
		// 'billing' is the card step of registration; 'expired' is the wall a
		// lapsed account meets — data kept, renew or take it with you.
		mode: hold,
		pricing,
		/*
		 * Which plan leads. Both are on the page either way — this only decides
		 * which one is the big button, so somebody who pressed "for the family"
		 * on the front page is not quietly sold a single seat here.
		 */
		wanted: wantedPlan(cookies),
		trialDaysAhead,
		yearly: hasYearlyPrice(),
		exportsLeft: hold === 'expired' ? exportAllowance(locals.user.id).remaining : 0,
		firstChargeOn: new Date(Date.now() + trialDaysAhead * 86400_000).toISOString().slice(0, 10)
	};
};

export const actions: Actions = {
	checkout: async ({ request, locals, cookies }) => {
		const formData = await request.formData();
		const interval = formData.get('interval') === 'monthly' ? 'monthly' : 'yearly';
		const tier = formData.get('tier') === 'family' ? 'family' : 'solo';

		// The store copy pays through Play, not Paddle — the page said so (it
		// found the Digital Goods API, which only the Play-installed app has),
		// and no Paddle transaction is minted for a purchase Paddle will never
		// see. Everyone else falls through to the provider as before.
		if (formData.get('channel') === 'play' && playConfigured()) {
			forgetWantedPlan(cookies);
			redirect(303, `/buy?play=1&interval=${interval}&tier=${tier}`);
		}

		let url: string;
		try {
			url = await createCheckout(locals.user!.id, interval, tier);
		} catch (e) {
			return toActionFailure(e);
		}
		// Asked and answered: from here the plan is whatever the provider bills.
		forgetWantedPlan(cookies);
		redirect(303, url);
	}
};
