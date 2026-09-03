import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { newsletterEnabled, unsubscribe } from '$lib/server/services/newsletter';

/**
 * The link at the bottom of every issue.
 *
 * One click, no session, no confirmation step. A way out with a form in front
 * of it is the thing that makes somebody press the spam button instead, which
 * costs the domain far more than the address ever did.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!newsletterEnabled()) error(404, 'Not found');

	const email = unsubscribe(url.searchParams.get('t'));
	if (!email) error(404, 'Not found');

	return { email };
};
