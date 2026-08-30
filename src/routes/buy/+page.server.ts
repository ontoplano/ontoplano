import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { paddleClientConfig } from '$lib/server/services/billing';

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
	const paddle = paddleClientConfig();
	if (!paddle) error(404, 'Not found');
	if (!url.searchParams.get('_ptxn')) redirect(302, '/settings/billing');

	return {
		paddle,
		successUrl: `${url.origin}/settings/billing?welcome=1`
	};
};
