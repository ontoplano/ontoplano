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
import { onboardEntitlement } from '$lib/server/services/billing';
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

/**
 * One JSON line per request.
 *
 * The thing you actually want when somebody says "it broke around lunchtime":
 * grep-able, with a duration and a request id the error log shares. Outermost
 * in the sequence so the duration covers everything, including the other hooks.
 * Immutable assets are skipped — they are the build, not the traffic.
 */
const handleRequestLog: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/_app/')) return resolve(event);

	event.locals.rid = crypto.randomUUID().slice(0, 6);
	const startedAt = Date.now();
	const response = await resolve(event);

	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			level: 'info',
			id: event.locals.rid,
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			ms: Date.now() - startedAt,
			user: event.locals.user?.id ?? null
		})
	);

	return response;
};

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
			// The same things the form path does, because this is the other
			// door into the same act. A card-first account starts on nothing
			// and meets the billing page on its first navigation.
			claimFirstAccount(userId);
			onboardEntitlement(userId, Boolean(invite), now);
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

	// The one page allowed to load the payment provider's script. Paddle's
	// overlay checkout is their JS on our page framing their origin — that is
	// what "the provider handles the card" means in the web flow — and /buy
	// exists so the rest of the app never widens its CSP for it.
	if (event.url.pathname === '/buy') {
		const csp = response.headers.get('content-security-policy');
		if (csp) {
			response.headers.set(
				'content-security-policy',
				csp
					.replace('script-src', 'script-src https://cdn.paddle.com')
					.replace('connect-src', 'connect-src https://*.paddle.com https://*.paddle.io') +
					"; frame-src 'self' https://*.paddle.com https://*.paddle.io"
			);
		}
	}

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
/**
 * The verified-address gate, when the deployment asks for one.
 *
 * `ONTOPLANO_REQUIRE_VERIFIED_EMAIL=true` does not block the sign-in — it
 * narrows the signed-in world: an unverified account lands on the page that
 * says the address is unverified and offers a resend, and every other page
 * leads back there. The mail's own verify link (under /api/auth) stays
 * reachable, or the link could never do its work.
 */
const REQUIRE_VERIFIED_EMAIL = process.env.ONTOPLANO_REQUIRE_VERIFIED_EMAIL === 'true';
const VERIFY_EXEMPT = [
	'/login',
	'/api',
	'/healthz',
	'/privacy',
	'/terms',
	'/favicon.svg',
	'/icons',
	'/manifest.webmanifest'
];

const handleUnverified: Handle = ({ event, resolve }) => {
	if (!REQUIRE_VERIFIED_EMAIL || !event.locals.user || event.locals.user.emailVerified) {
		return resolve(event);
	}
	const path = event.url.pathname;
	const exempt = VERIFY_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`));
	if (!exempt) redirect(303, '/login/verify');
	return resolve(event);
};

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
	handleRequestLog,
	handleSecurityHeaders,
	handleAuthRateLimit,
	handleRegistration,
	handleBetterAuth,
	handleUnverified,
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

	// The same id the request line carries, so the error and its request are
	// one grep. Assets skip the logging hook and get their own.
	const id = event.locals.rid ?? crypto.randomUUID().slice(0, 6);

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
	// eslint-disable-next-line no-var
	var __ontoplanoSweep: ReturnType<typeof setInterval> | undefined;
}

/**
 * The nightly sweep, as a timer in the one process there is.
 *
 * Per-stream retention cannot wait for its account to visit, and this app is a
 * single long-running node process with no cron of its own — so the process
 * carries the timer. Once at boot (a deploy must not postpone an overdue
 * sweep by a day) and then daily. Guarded like the death watch, because
 * SvelteKit imports this module in more than one context.
 */
if (!building && !globalThis.__ontoplanoSweep) {
	const sweep = async () => {
		try {
			const { sweepAllStreams } = await import('$lib/server/services/streams');
			const { streams, deleted } = sweepAllStreams();
			if (deleted > 0) {
				console.log(
					JSON.stringify({
						at: new Date().toISOString(),
						level: 'info',
						message: `Retention sweep: ${deleted} points deleted across ${streams} streams`
					})
				);
			}
		} catch (e) {
			console.error('Retention sweep failed:', e);
		}
	};

	globalThis.__ontoplanoSweep = setInterval(sweep, 24 * 60 * 60 * 1000);
	// Never keep an otherwise-done process alive for a sweep.
	globalThis.__ontoplanoSweep.unref?.();
	void sweep();
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
