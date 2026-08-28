import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { ensureUserCategories } from '$lib/server/db/ensure-categories';
import { DEFAULT_THEME, getStyle, getTheme } from '$lib/server/settings';
import { clientKey, rateLimit, signUpBudget } from '$lib/server/rate-limit';
import { checkSignUpAllowed, consumeInvite } from '$lib/server/services/registration';
import { claimFirstAccount } from '$lib/server/services/admin';
import { startTrial } from '$lib/server/services/subscriptions';
import { record } from '$lib/server/services/audit';
import { toJsonError } from '$lib/server/services/errors';

/**
 * Registration control, at the one door there is.
 *
 * Sign-up is better-auth's endpoint, so the check cannot live in a route: it
 * goes here, in front of it. An instance is `closed` by default — the common
 * deployment is one person on one box, and an open sign-up form there is an
 * invitation to squat it — and the first account is always allowed in, or a
 * fresh install could never be used.
 *
 * The invite is only marked used once the account exists, so a sign-up that
 * fails on a taken email does not burn the code.
 */
/** The client address, where the adapter can work one out. */
function safeAddress(event: Parameters<Handle>[0]['event']): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}

function inviteFrom(body: string): unknown {
	try {
		const parsed = JSON.parse(body || '{}');
		return typeof parsed === 'object' && parsed !== null ? parsed.invite : '';
	} catch {
		return '';
	}
}

const handleRegistration: Handle = async ({ event, resolve }) => {
	if (event.request.method !== 'POST' || !event.url.pathname.startsWith('/api/auth/sign-up')) {
		return resolve(event);
	}

	// Two doors into the same act, one rule: the form action in
	// `routes/login/+page.server.ts` calls better-auth in-process and never
	// reaches this hook, so it asks the same question for itself.
	const budget = signUpBudget(clientKey(event.request, event.getClientAddress));
	if (!budget.allowed) {
		return new Response(
			JSON.stringify({ message: 'Too many accounts from here. Try again later.' }),
			{
				status: 429,
				headers: {
					'content-type': 'application/json',
					'Retry-After': String(budget.retryAfterSeconds)
				}
			}
		);
	}

	const raw = await event.request.text();
	event.request = new Request(event.request, { body: raw });

	const code = inviteFrom(raw);

	const now = new Date();
	let invite: { id: number } | null;
	try {
		invite = checkSignUpAllowed(code, now).invite;
	} catch (e) {
		return toJsonError(e);
	}

	const response = await resolve(event);

	if (response.status >= 200 && response.status < 300) {
		const created = await response.clone().json();
		const userId = created?.user?.id;

		if (typeof userId === 'string') {
			if (invite) consumeInvite(invite.id, userId, now);
			// The same two things the form path does, because this is the other
			// door into the same act.
			claimFirstAccount(userId);
			startTrial(userId, now);
			record(userId, 'registered', { ip: safeAddress(event) });
		}
	}

	return response;
};

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
	/*
	 * A stranger gets the playful one.
	 *
	 * `sober` is the right default for somebody who has chosen this app and now
	 * has to look at it for an hour a day. It is the wrong first impression: the
	 * front page in flat grey looks like a form. Signed in, the account's own
	 * setting wins as it always did.
	 */
	const style = event.locals.user ? getStyle(event.locals.user.id) : 'playful';

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

/**
 * A form posted after the session ended lands on the login page.
 *
 * The signed-out check lives in the root layout's load, and a load does not run
 * for a form action — the action runs first and its `locals.user` is undefined.
 * So a page left open overnight answered every submit with "Unexpected error"
 * instead of saying the obvious thing, which is that you are signed out.
 *
 * Everything under `/api` is exempt: those endpoints carry their own token and
 * answer 401 themselves, and a redirect to an HTML page is not an answer a
 * plugin can read.
 */
const PUBLIC_WRITES = ['/login', '/demo', '/api/auth'];

const handleSignedOutWrites: Handle = ({ event, resolve }) => {
	const writes = event.request.method !== 'GET' && event.request.method !== 'HEAD';
	const path = event.url.pathname;
	const isPublic = PUBLIC_WRITES.some((p) => path === p || path.startsWith(`${p}/`));

	if (writes && !isPublic && !path.startsWith('/api/') && !event.locals.user) {
		redirect(303, '/login');
	}

	return resolve(event);
};

export const handle: Handle = sequence(
	handleSecurityHeaders,
	handleAuthRateLimit,
	handleRegistration,
	handleBetterAuth,
	handleSignedOutWrites,
	handleTheme
);

/**
 * What happened, when something goes wrong.
 *
 * A 500 used to reach the error page and leave nothing behind: no stack, no way
 * to tie the page somebody was looking at to a line in a log. The id is shown
 * on the error page, so "it broke and it said a3f9c1" is a search rather than a
 * conversation.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	// 404s are not incidents; logging every one buries the ones that matter.
	if (status === 404) return { message: 'Not found' };

	const id = crypto.randomUUID().slice(0, 6);

	console.error(
		JSON.stringify({
			at: new Date().toISOString(),
			level: 'error',
			id,
			method: event.request.method,
			path: event.url.pathname,
			user: event.locals.user?.id ?? null,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		})
	);

	return { message: 'Something went wrong on our side.', id };
};

/**
 * A note before dying.
 *
 * The dev server fell over more than once with nothing in `journalctl` and
 * nothing in the console — because a process that exits on an unhandled
 * rejection says nothing on its way out. These do not stop the exit; they make
 * sure it is not silent, which is the difference between a bug you can chase
 * and one you can only re-encounter.
 *
 * Registered once, guarded because SvelteKit imports this module in more than
 * one context.
 */
declare global {
	// eslint-disable-next-line no-var
	var __ontoplanoDeathWatch: boolean | undefined;
}

if (!building && !globalThis.__ontoplanoDeathWatch) {
	globalThis.__ontoplanoDeathWatch = true;

	const note = (kind: string, detail: unknown) =>
		console.error(
			JSON.stringify({
				at: new Date().toISOString(),
				level: 'fatal',
				kind,
				message: detail instanceof Error ? detail.message : String(detail),
				stack: detail instanceof Error ? detail.stack : undefined
			})
		);

	process.on('uncaughtException', (error) => {
		note('uncaughtException', error);
		// Node's default is to exit; keeping that, having said why.
		process.exit(1);
	});

	process.on('unhandledRejection', (reason) => note('unhandledRejection', reason));
	process.on('SIGTERM', () => {
		note('SIGTERM', 'asked to stop');
		process.exit(0);
	});
}
