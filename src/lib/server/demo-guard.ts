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
export const DEMO_READ_ONLY = ['/admin', '/settings/instance'];

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

	if (writes && path === '/settings/account' && new URLSearchParams(search).has('/delete')) {
		return 'The demo account is temporary — it deletes itself in a few hours.';
	}

	if (writes && under(path, DEMO_READ_ONLY) && !under(path, DEMO_WRITABLE)) {
		// Named, not general: everything else on the demo IS editable, and a
		// message saying otherwise sends somebody away thinking the whole thing
		// is a screenshot.
		return 'The demo can look at the administration pages but not change them.';
	}

	return null;
}
