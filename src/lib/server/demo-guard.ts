/**
 * What a visitor to the public demo may not do.
 *
 * Every visitor gets an account of their own now, so most of what a demo used
 * to have to protect protects itself: renaming everything only ruins your own
 * copy, and it is deleted in a few hours anyway. Two things are still refused.
 *
 *  - **Changing the identity.** The address, the password, the sessions,
 *    deleting the account. None of it would hurt anybody else — but changing
 *    the address makes the box send mail to a stranger's inbox on request,
 *    which is a spam relay with extra steps, and the rest only locks somebody
 *    out of the demo they are in the middle of.
 *  - **Changing the box.** `/admin` and `/settings/instance` describe the
 *    instance rather than the account. A demo visitor is an ordinary member and
 *    should not reach them at all; this is the second lock on that door, for an
 *    instance that hands a demo account more than it should.
 *  - **Integrations.** A token minted here is a working key to the demo's API
 *    for as long as the account lives, and the page also mints calendar links
 *    and connects a phone. The page is worth looking at — it is part of what
 *    the demo is showing — so it opens and refuses, rather than hiding.
 *  - **Signing out.** The demo account has no password anybody knows, so
 *    leaving it is leaving for good: the door closes behind you and the visit
 *    is over with no way back in. The button is gone from the menu and the
 *    endpoint refuses, because a demo that can be locked yourself out of is a
 *    demo somebody tries once.
 *
 * The rules live here rather than in the routes because both areas grow: a new
 * `/admin` action, or a new better-auth endpoint that can change an identity,
 * must be covered without anybody remembering to cover it.
 */

/**
 * Endpoints that change who an account is, refused whatever the method.
 *
 * better-auth answers these inside its own handler, so the guard has to sit in
 * front of it — a check placed afterwards never sees the request at all.
 */
export const DEMO_FORBIDDEN = [
	'/api/auth/change-password',
	'/api/auth/change-email',
	'/api/auth/delete-user',
	'/api/auth/update-user',
	'/api/auth/revoke-sessions'
];

/** Readable on the demo, never writable. */
export const DEMO_READ_ONLY = ['/admin', '/settings/instance', '/settings/integrations'];

/**
 * The way out, which on the demo is a way out with no way back.
 *
 * There is no password to sign back in with — the account was made for this
 * visit and handed over by a cookie — so signing out ends the demo without
 * saying so. Refused here, and the menu does not offer it.
 */
export const DEMO_NO_EXIT = ['/api/auth/sign-out', '/logout'];

/** The form action the menu's Sign out posts to: `/login?/signOut`. */
export const DEMO_NO_EXIT_ACTION = '/signOut';

/**
 * The exception inside the exception.
 *
 * `/admin/stop` is how somebody being impersonated gets their own session back.
 * It has to work wherever impersonation does, demo included.
 */
export const DEMO_WRITABLE = ['/admin/stop'];

const under = (path: string, prefixes: string[]) =>
	prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * The sentence to refuse this request with, or `null` to let it through.
 *
 * Only called on a demo instance. `search` carries the query string because a
 * form action names itself there — `?/delete` — and the account page's delete
 * is one of the ways to end the demo.
 */
export function demoRefusal(method: string, path: string, search = ''): string | null {
	const writes = method !== 'GET' && method !== 'HEAD';

	if (under(path, DEMO_FORBIDDEN))
		return 'The demo account is temporary — its address and password cannot be changed.';

	const noWayBack =
		'The demo has no way back in once you leave it — close the tab when you are done.';
	if (under(path, DEMO_NO_EXIT)) return noWayBack;
	if (writes && new URLSearchParams(search).has(DEMO_NO_EXIT_ACTION)) return noWayBack;

	if (writes && path === '/settings/account' && new URLSearchParams(search).has('/delete')) {
		return 'The demo account is temporary — it deletes itself in a few hours.';
	}

	if (writes && path.startsWith('/settings/integrations')) {
		// The sentence he asked for, in the words he asked for them: short, and
		// about the demo rather than about permissions.
		return "You're not allowed to do that in the demo.";
	}

	if (writes && under(path, DEMO_READ_ONLY) && !under(path, DEMO_WRITABLE)) {
		// Named, not general: everything else on the demo IS editable, and a
		// message saying otherwise sends somebody away thinking the whole thing
		// is a screenshot.
		return 'The demo can look at the administration pages but not change them.';
	}

	return null;
}
