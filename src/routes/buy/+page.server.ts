import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { paddleClientConfig } from '$lib/server/services/billing';
import { pricing } from '$lib/server/settings';

/**
 * The one page that loads the payment provider's script.
 *
 * `?/checkout` on the billing page mints a transaction and lands here with
 * `?_ptxn=…`; Paddle.js reads that itself and opens its overlay. The page
 * under the overlay states the deal in our own words — card now, first
 * charge in fourteen days — because the person typing a card number should
 * not have to derive that from a $0.00 line item.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	const paddle = paddleClientConfig();
	if (!paddle) error(404, 'Not found');
	if (!url.searchParams.get('_ptxn')) redirect(302, '/settings/billing');

	const { trialDays } = pricing();
	const firstCharge = new Date(Date.now() + trialDays * 86400_000);

	return {
		paddle,
		trialDays,
		firstChargeOn: firstCharge.toISOString().slice(0, 10),
		successUrl: `${url.origin}/settings/billing?welcome=1`
	};
};
