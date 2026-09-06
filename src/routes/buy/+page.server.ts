import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { checkoutClientConfig, playConfigured, playSkus } from '$lib/server/services/billing';

/**
 * The one page that loads the payment provider's script.
 *
 * A checkout action mints a transaction and lands here with `?_ptxn=…`;
 * Paddle.js reads that itself and opens its overlay. The page is only the
 * overlay's backdrop — the terms were already read on /start or the
 * billing page, so nothing here competes with the payment window.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const successUrl = `${url.origin}/settings/billing?welcome=1`;

	/*
	 * The store copy: no provider transaction exists and none is minted. The
	 * purchase happens in Play's own sheet, on this page, and the page then
	 * hands the purchase token to /api/billing/play/claim. Which product to
	 * buy is in the query, put there by the checkout action.
	 */
	if (url.searchParams.get('play')) {
		const skus = playSkus();
		if (!playConfigured() || !skus) error(404, 'Not found');
		const interval = url.searchParams.get('interval') === 'yearly' ? 'yearly' : 'monthly';
		const family = url.searchParams.get('tier') === 'family';
		const sku = family
			? interval === 'yearly'
				? skus.familyYearly
				: skus.familyMonthly
			: interval === 'yearly'
				? skus.yearly
				: skus.monthly;
		return { play: { sku }, paddle: null, successUrl };
	}

	const paddle = checkoutClientConfig();
	if (!paddle) error(404, 'Not found');
	if (!url.searchParams.get('_ptxn')) redirect(302, '/settings/billing');

	return { play: null, paddle, successUrl };
};
