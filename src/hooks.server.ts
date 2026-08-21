import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { ensureUserCategories } from '$lib/server/db/ensure-categories';
import { DEFAULT_THEME, getTheme } from '$lib/server/settings';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		ensureUserCategories(session.user.id);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Stamp the user's theme into <html> before anything renders.
 *
 * Runs after the auth handle in the sequence, so `locals.user` is already set.
 * Doing this on the client instead would paint the wrong theme first and then
 * snap to the right one.
 */
const handleTheme: Handle = ({ event, resolve }) => {
	const theme = event.locals.user ? getTheme(event.locals.user.id) : DEFAULT_THEME;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%ontoplano.theme%', theme)
	});
};

export const handle: Handle = sequence(handleBetterAuth, handleTheme);
