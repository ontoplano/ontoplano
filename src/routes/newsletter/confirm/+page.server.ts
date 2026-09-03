import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { confirm, newsletterEnabled } from '$lib/server/services/newsletter';

/**
 * The second half of the double opt-in, and the only thing that puts an
 * address on the list.
 *
 * Signed out by definition: the person following it has no account here and
 * may never have one. A 404 for a token that is not one, rather than a
 * message — the difference between "wrong token" and "no such token" is the
 * only thing an enumerator would learn.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!newsletterEnabled()) error(404, 'Not found');

	const email = confirm(url.searchParams.get('t'));
	if (!email) error(404, 'Not found');

	return { email };
};
