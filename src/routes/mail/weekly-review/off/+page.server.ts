import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { setUserSetting } from '$lib/server/settings';
import { REVIEW_MAIL_KEY, unsubscribeTokenValid } from '$lib/server/services/review-mail';

/**
 * The link at the bottom of the weekly review, and the only thing it does.
 *
 * Reachable with no session on purpose: somebody who has stopped opening the
 * app is exactly who this mail is for, and asking them to sign in before they
 * can make it stop is how a lifecycle mail becomes a complaint. The signature
 * in the URL is what makes naming an account in it safe — without one, this
 * would be a way to turn off anybody's mail by guessing an id.
 *
 * It turns off one thing and says so. It cannot turn anything on, so a link
 * that leaks does no more harm than the click it was already for, and there is
 * nothing here worth replaying.
 */
export const load: PageServerLoad = async ({ url }) => {
	const userId = url.searchParams.get('u') ?? '';
	const token = url.searchParams.get('t') ?? '';

	// One answer for a bad signature and for an account that is not there:
	// telling the two apart is telling a stranger which ids exist.
	if (!userId || !unsubscribeTokenValid(userId, token)) error(404, 'Not found');

	setUserSetting(userId, REVIEW_MAIL_KEY, 'off');

	return {};
};
