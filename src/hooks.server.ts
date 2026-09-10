import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { provider } from '$lib/server/billing/index';
import { sequence } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { ensureUserCategories } from '$lib/server/db/ensure-categories';
import {
	DEFAULT_THEME,
	getStyle,
	getTheme,
	isDemo,
	isStaging,
	siteCookieDomain
} from '$lib/server/settings';
import {
	createDemoAccount,
	DEMO_ACCOUNTS_PER_ADDRESS,
	DEMO_WINDOW_MS,
	isDemoAccount,
	maybeSweepDemoAccounts,
	touchDemoAccount
} from '$lib/server/services/demo';
import { clientKey, rateLimit, signUpBudget } from '$lib/server/rate-limit';
import { checkSignUpAllowed, consumeInvite } from '$lib/server/services/registration';
import { claimFirstAccount } from '$lib/server/services/admin';
import {
	claimCheckouts,
	hasUnsettledCheckout,
	onboardEntitlement
} from '$lib/server/services/billing';
import { accessHoldFor, holdDestination } from '$lib/server/services/access';
import { record } from '$lib/server/services/audit';
import { toJsonError } from '$lib/server/http-errors';
import { refuse } from '$lib/server/refuse';
import { demoRefusal } from '$lib/server/demo-guard';

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
	let invite: { id: number; grantsUntil: string | null } | null;
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
			const spent = invite ? consumeInvite(invite.id, userId, now) : false;
			// The same things the form path does, because this is the other
			// door into the same act. A card-first account starts on nothing
			// and meets the billing page on its first navigation. The code's
			// grant goes only to the account that actually spent it.
			claimFirstAccount(userId);
			onboardEntitlement(userId, spent ? invite : null, now);
			record(userId, 'registered', { ip: safeAddress(event) });
		}
	}

	return response;
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	/*
	 * The admin plugin ships a whole management surface whether or not the app
	 * offers it, and the app offers none of it — the plugin is here for its
	 * role column. Each endpoint sidesteps a rule this app makes on purpose:
	 * impersonation is reading somebody's diary; `set-user-password` is
	 * impersonation with one extra step; `remove-user` deletes an account
	 * around the typed-email confirmation, the owner protection and the audit
	 * line; `create-user` mints accounts around registration mode. So the
	 * whole prefix is one closed door, in front of the plugin, where no role
	 * or session opens it — the app's own /admin pages go through the audited
	 * services instead.
	 */
	if (event.url.pathname.startsWith('/api/auth/admin/')) {
		return new Response(JSON.stringify({ message: 'Not found' }), {
			status: 404,
			headers: { 'content-type': 'application/json' }
		});
	}

	/*
	 * Email changes go through the settings form, which asks for the current
	 * password and honours the instance's `allowEmailChange` switch. The
	 * plugin's raw endpoint asks for neither — on an unverified account it
	 * would move the address, and then the password, on a borrowed session
	 * alone. The form action calls the auth API in-process, so shutting the
	 * HTTP door costs it nothing.
	 */
	if (event.url.pathname.startsWith('/api/auth/change-email')) {
		return new Response(JSON.stringify({ message: 'Not found' }), {
			status: 404,
			headers: { 'content-type': 'application/json' }
		});
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		ensureUserCategories(session.user.id);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * One bit for the marketing site: somebody is signed in here.
 *
 * ontoplano.com is a different deployment on a different hostname, so a
 * visitor with an open session looks exactly like a stranger to it — and the
 * front page answers with the pitch and a sign-up button, which is the wrong
 * thing to show somebody who already pays. This writes a cookie on the shared
 * parent domain that says only that, and the site's own script turns it into a
 * redirect into the app.
 *
 * Off unless an operator names the domain: a self-hosted instance has one
 * hostname, nobody to tell, and no business writing cookies for a parent
 * domain it does not own.
 */
const SIGNED_IN_HINT = 'ontoplano_signed_in';

const handleSiteHint: Handle = async ({ event, resolve }) => {
	const domain = siteCookieDomain();
	if (!domain) return resolve(event);

	const stated = event.cookies.get(SIGNED_IN_HINT) === '1';
	if (event.locals.user && !stated) {
		event.cookies.set(SIGNED_IN_HINT, '1', {
			domain,
			path: '/',
			// The site's own script reads it, so it cannot be HttpOnly. It says
			// nothing a session cookie says: no id, no name, no token.
			httpOnly: false,
			secure: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 90
		});
	} else if (!event.locals.user && stated) {
		event.cookies.delete(SIGNED_IN_HINT, { domain, path: '/' });
	}

	return resolve(event);
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

	/*
	 * And which instance this is, in the two places a phone reads it.
	 *
	 * An installed copy takes its icon and its name from the head of the page it
	 * was installed from, so a staging instance that serves production's head is
	 * a second identical app on somebody's home screen. Marked here rather than
	 * in the manifest alone, because iOS reads none of the manifest and Android
	 * reads the favicon before it reads anything else.
	 */
	// Dev wears its own mark for the same reason staging does: `make dev`
	// saved to a phone's home screen must never be the tile the real app is.
	const mark = isStaging() ? '-staging' : dev ? '-dev' : '';
	const appname = isStaging() ? 'Ontoplano staging' : dev ? 'Ontoplano — Dev' : 'Ontoplano';

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%ontoplano.theme%', theme)
				.replace('%ontoplano.style%', style)
				.replaceAll('%ontoplano.mark%', mark)
				.replaceAll('%ontoplano.appname%', appname)
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

	/*
	 * The one page allowed to load a payment provider's script.
	 *
	 * An overlay checkout is the provider's JavaScript on our page framing their
	 * origin — that is what "the provider handles the card" means in a browser —
	 * so /buy exists precisely so the rest of the app never widens its CSP.
	 *
	 * Which origins those are is the provider's business, not this file's: it
	 * asks. A build with no provider widens nothing, because there is nothing to
	 * widen it for.
	 */
	if (event.url.pathname === '/buy') {
		const origins = provider().checkoutOrigins?.();
		const csp = origins ? response.headers.get('content-security-policy') : null;
		if (csp && origins) {
			response.headers.set(
				'content-security-policy',
				csp
					.replace('script-src', `script-src ${origins.script}`)
					.replace('connect-src', `connect-src ${origins.connect}`) +
					`; frame-src 'self' ${origins.frame}`
			);
		}
	}

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');

	/*
	 * The header says the encoding, not only the meta tag.
	 *
	 * Kit answers pages with a bare `text/html`, and link scrapers trust the
	 * header over the markup — reddit read the title's em dash as Latin-1 and
	 * previewed "Ontoplano â". The pages ARE UTF-8; this makes the header say
	 * so wherever it was silent.
	 */
	const contentType = response.headers.get('content-type');
	if (contentType === 'text/html') {
		response.headers.set('content-type', 'text/html; charset=utf-8');
	}
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
 * The account-level holds, enforced at the one door.
 *
 * Which holds exist and when they apply is `services/access.ts`'s business —
 * this hook only walks a held browser to the right page. One exempt list:
 * the hold pages themselves, the auth machinery (the verify link must stay
 * clickable), the export (an
 * expired account's data stays its own), and the public plumbing. /api is
 * exempt HERE because the API door runs the same check itself and answers
 * in JSON instead of a redirect.
 */
const HOLD_EXEMPT = [
	'/start',
	'/buy',
	'/settings/billing',
	'/settings/account/export',
	'/login',
	'/legal',
	'/privacy',
	'/terms',
	'/api',
	'/healthz',
	'/favicon.svg',
	'/icons',
	'/manifest.webmanifest'
];

/**
 * The demo's refusals, in front of better-auth rather than behind it.
 *
 * better-auth answers everything under /api/auth itself, inside its own
 * handle — so a guard placed after it never sees those requests at all, and
 * the demo's password could be changed by anybody who found the endpoint.
 *
 * Which requests are refused, and why, is `$lib/server/demo-guard`. This is
 * only where it is applied.
 */
const handleDemoGuard: Handle = async ({ event, resolve }) => {
	if (!isDemo()) return resolve(event);

	const refusal = demoRefusal(event.request.method, event.url.pathname, event.url.search);
	if (refusal) {
		if (refusal.scope === 'everyone') return refuse(event.request, refusal.said);

		/*
		 * Account-scoped: the rule binds the throwaway copies, not the box.
		 *
		 * This hook runs before the auth handle populates locals — it has to,
		 * or better-auth answers the guarded endpoints itself — so it asks for
		 * the session directly, and only on the rare guarded paths. No session
		 * passes through: the endpoint's own auth answers that case, and an
		 * operator signing IN is exactly a guarded-path request with no session
		 * yet.
		 */
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (!session?.user?.id || isDemoAccount(session.user.id)) {
			return refuse(event.request, refusal.said);
		}
	}

	return resolve(event);
};

/** Set on the first page view, returned by anything that keeps cookies. */
const DEMO_HANDSHAKE = 'onto_demo';
/** Says "you have already been bounced once", so a cookieless client stops. */
const DEMO_BOUNCE = 'demo';

const handleDemo: Handle = async ({ event, resolve }) => {
	if (!isDemo()) return resolve(event);

	/*
	 * The tidy-up, on every request rather than only when somebody new arrives.
	 *
	 * It used to run inside the branch that hands a *first-time* visitor an
	 * account, which meant a demo nobody new came to never cleaned up: the
	 * expired accounts stayed, and the one person refreshing the page kept the
	 * instance busy without ever triggering the thing meant to end their own
	 * session. `maybeSweep` throttles itself to once a minute, so this costs
	 * nothing on the other requests.
	 */
	maybeSweepDemoAccounts();

	const path = event.url.pathname;

	/*
	 * The waiting room makes its own account, from its own action.
	 *
	 * Left to this handle, arriving at /demo with the handshake cookie would
	 * create the account and redirect before a pixel of the page was drawn —
	 * which is the blank wait the page exists to replace.
	 */
	if (path === '/demo' || path.startsWith('/demo/')) return resolve(event);

	/*
	 * The operator's door. Auto-minting an account on every signed-out page
	 * view made /login unreachable, which made the demo a box its own
	 * operator could not sign into. Nothing links here from the demo; a
	 * visitor who types it sees a sign-in form for an instance whose
	 * registration is closed, which is a dead end, not a way in.
	 */
	if (path === '/login' || path.startsWith('/login/')) return resolve(event);
	const writes = event.request.method !== 'GET' && event.request.method !== 'HEAD';

	/*
	 * Only a page view signs somebody in: an asset or an API call arriving
	 * without a session should answer as itself, not mint a session each time.
	 *
	 * A data request counts as a page view. Client-side navigation asks for
	 * `…/__data.json` rather than HTML, so after the hourly reset has deleted
	 * every session, moving between pages in an open tab reached the layout with
	 * nobody signed in and was walked to the login page — on a demo whose entire
	 * premise is that there is no login page. It signs in and is sent to the
	 * page itself rather than to the data URL, which is not a thing to navigate
	 * to.
	 */
	const dataSuffix = '/__data.json';
	const isData = event.isDataRequest || path.endsWith(dataSuffix);
	const wantsPage =
		!writes && (isData || Boolean(event.request.headers.get('accept')?.includes('text/html')));
	let signedIn = false;
	if (!event.locals.user && wantsPage && !path.startsWith('/api/')) {
		/*
		 * A copy of their own, made on arrival.
		 *
		 * Everybody used to be signed into one account: two people looking at
		 * once watched each other type, and one person renaming everything ruined
		 * it for the rest until the hourly wipe took an hour of somebody else's
		 * poking about with it. Now the visitor gets an account, seeded with the
		 * same week the development database has, deleted once it has been left
		 * alone. See `services/demo.ts`.
		 *
		 * Rate limited per address, because this is the one place in the app
		 * where an unauthenticated GET creates an account and runs a seed. The
		 * budget is generous for a person and useless to a script.
		 */
		const key = `demo:${clientKey(event.request, event.getClientAddress)}`;
		const budget = rateLimit(key, DEMO_ACCOUNTS_PER_ADDRESS, DEMO_WINDOW_MS);

		/*
		 * One handshake before anything is created.
		 *
		 * An account is a row and a seeded week on disk, and a client that does
		 * not keep cookies would ask for a new one on every single request — a
		 * crawler, a link unfurler, `curl -L`, a health probe that sends
		 * `Accept: text/html`. The first was found by `curl -L` making six
		 * accounts out of one visit.
		 *
		 * So the first page view sets a cookie and bounces back to the same
		 * address. A browser returns it and gets an account; anything that does
		 * not returns with `?demo` and no cookie, which is how we know not to
		 * bother — it gets the front page, signed out, and no more redirects.
		 */
		const handshook = event.cookies.get(DEMO_HANDSHAKE) === '1';
		const bounced = event.url.searchParams.has(DEMO_BOUNCE);

		if (budget.allowed && !handshook && !bounced) {
			event.cookies.set(DEMO_HANDSHAKE, '1', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 600
			});
			const target = path.endsWith(dataSuffix) ? path.slice(0, -dataSuffix.length) || '/' : path;

			/*
			 * A browser is sent to the waiting room, which draws the wait and
			 * then makes the account. Anything else — a data request from a tab
			 * whose session the hourly reset took away — bounces back to where it
			 * was and is dealt with below, because a client waiting for JSON has
			 * no use for a page.
			 */
			if (!isData) {
				const room = new URL('/demo', event.url.origin);
				if (target !== '/') room.searchParams.set('next', target);
				redirect(303, room.pathname + room.search);
			}

			const url = new URL(target + event.url.search, event.url.origin);
			url.searchParams.set(DEMO_BOUNCE, '1');
			redirect(303, url.pathname + url.search);
		}

		if (budget.allowed && handshook) {
			try {
				const account = await createDemoAccount(event.url.hostname);
				if (account) {
					await auth.api.signInEmail({
						body: { email: account.email, password: account.password },
						headers: event.request.headers,
						asResponse: false
					});
					signedIn = true;
				}
			} catch (e) {
				// A demo that cannot make an account is still a readable landing
				// page, so this never takes the site down.
				console.error('demo account creation failed', e);
			}
		}
	} else if (event.locals.user && wantsPage) {
		// Still here, so still wanted. The lifetime runs from the last page view.
		touchDemoAccount(event.locals.user.id);
	}

	// Outside the try: the cookie is set on this response by better-auth's
	// SvelteKit plugin, and the reload is what makes the session visible to
	// the load functions of the page that was asked for. A redirect thrown
	// inside the try above would have been caught as a failure.
	if (signedIn) {
		const target = path.endsWith(dataSuffix) ? path.slice(0, -dataSuffix.length) || '/' : path;
		// Without the marker: it has done its job, and an address somebody might
		// copy out of the bar should not carry it.
		const url = new URL(target + event.url.search, event.url.origin);
		url.searchParams.delete(DEMO_BOUNCE);
		redirect(303, url.pathname + url.search);
	}

	return resolve(event);
};

const handleAccessHolds: Handle = async ({ event, resolve }) => {
	if (!event.locals.user) return resolve(event);
	const path = event.url.pathname;
	if (HOLD_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`))) return resolve(event);

	let hold = accessHoldFor(event.locals.user);

	/*
	 * Before sending anybody to the pay page: did they already pay?
	 *
	 * This is the last line of defence against the worst thing this app can
	 * do. Somebody paid, the provider mailed them a receipt, its webhook never
	 * reached us — and they were sent back to the beginning of the payment
	 * flow, where the honest next step looks like paying a second time.
	 *
	 * So a hold that would bounce somebody is not trusted until the checkouts
	 * they opened have been accounted for. The guard is a single indexed read
	 * on the ordinary path: only an account with a checkout nobody ever closed
	 * pays for the round trip to the provider, and only until it is closed.
	 */
	if (hold === 'billing' || hold === 'expired') {
		if (hasUnsettledCheckout(event.locals.user.id)) {
			if (await claimCheckouts(event.locals.user.id)) {
				hold = accessHoldFor(event.locals.user);
			}
		}
	}

	if (hold) redirect(303, holdDestination(hold));
	return resolve(event);
};

// `/demo` makes the demo's account from its own action, which is a POST by
// somebody who is not signed in — that is the whole point of it. It answers
// 404 unless this instance is the demo.
const PUBLIC_WRITES = ['/login', '/api/auth', '/demo'];

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
	handleDemoGuard,
	handleBetterAuth,
	handleDemo,
	handleAccessHolds,
	handleSignedOutWrites,
	handleSiteHint,
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
	var __ontoplanoDeathWatch: boolean | undefined;
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

/**
 * The reminder clock, in the one process there is.
 *
 * A reminder is a time, and the systemd timer that asked once a minute was
 * late by up to fifty-nine seconds every time it worked. This sleeps until the
 * exact moment the next one falls due, is woken by anything that writes a
 * reminder, and never sleeps longer than a minute regardless — see
 * `services/reminder-clock.ts` for why all three are needed. The unit stays as
 * a belt for the case where the app was restarted at the wrong moment.
 */
if (!building) {
	void import('$lib/server/services/reminder-clock').then(({ startReminderClock }) =>
		startReminderClock()
	);
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
