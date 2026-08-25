import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { ensureUserCategories } from '$lib/server/db/ensure-categories';
import { DEFAULT_STYLE, DEFAULT_THEME, getStyle, getTheme } from '$lib/server/settings';
import { clientKey, rateLimit } from '$lib/server/rate-limit';

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
	const style = event.locals.user ? getStyle(event.locals.user.id) : DEFAULT_STYLE;

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%ontoplano.theme%', theme).replace('%ontoplano.style%', style)
	});
};

/**
 * Security headers other than CSP.
 *
 * CSP lives in svelte.config.js, because SvelteKit emits an inline bootstrap
 * script and only it can hash that script — a header written here would block
 * it, and the symptom is subtle: pages render but nothing hydrates.
 */
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	// Only meaningful over TLS, and harmful if the deployment is plain HTTP —
	// so the deployment has to say it terminates TLS.
	if (process.env.ONTOPLANO_HTTPS === 'true') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

/**
 * Throttle credential submission.
 *
 * Keyed on the client address rather than the email, because the attack worth
 * stopping is one machine trying many passwords — limiting per-email instead
 * lets an attacker spread across accounts and lets anyone lock a victim out by
 * spamming their address.
 */
const AUTH_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 5 * 60 * 1000;

const handleAuthRateLimit: Handle = async ({ event, resolve }) => {
	const isCredentialPost =
		event.request.method === 'POST' &&
		(event.url.pathname.startsWith('/api/auth') || event.url.pathname === '/login');

	if (isCredentialPost) {
		const key = `auth:${clientKey(event.request, event.getClientAddress)}`;
		const { allowed, retryAfterSeconds } = rateLimit(key, AUTH_ATTEMPTS, AUTH_WINDOW_MS);
		if (!allowed) {
			return new Response('Too many attempts. Try again shortly.', {
				status: 429,
				headers: { 'Retry-After': String(retryAfterSeconds) }
			});
		}
	}

	return resolve(event);
};

export const handle: Handle = sequence(
	handleSecurityHeaders,
	handleAuthRateLimit,
	handleBetterAuth,
	handleTheme
);
