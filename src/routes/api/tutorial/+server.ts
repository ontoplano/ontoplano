import type { IsolatedEvent } from '$lib/isolated/routes';
import { readJson } from '$lib/json-body';
import { setTutorialSeen } from '$lib/services/settings';

/**
 * "I have been shown around."
 *
 * Session-authenticated and one line long, like `/api/client-errors`: the shell
 * mounts the tour on every page, so there is no page whose form action could
 * own this. It is a preference the chrome writes about itself, not a mutation
 * of anything a page is showing.
 *
 * The demo never posts here. Its account belongs to one visitor for a few hours
 * and the next visitor gets a different one, so a dismissal there is remembered
 * by the tab and nowhere else.
 */
export const POST = async (event: IsolatedEvent) => {
	if (!event.locals.user) return new Response(null, { status: 401 });

	const body = await readJson(event);
	setTutorialSeen(event.locals.user.id, body.seen !== false);

	return new Response(null, { status: 204 });
};
