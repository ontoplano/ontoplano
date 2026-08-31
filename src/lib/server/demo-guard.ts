/**
 * What a visitor to the public demo may not do.
 *
 * The demo signs everybody into one shared account, so "what could one visitor
 * do that ruins it for the next" is the whole question. There are two kinds of
 * answer and they are different in what they protect:
 *
 *  - **Locking everyone out.** Change the password, change the address, delete
 *    the account, revoke the sessions — any one of those leaves the demo dead
 *    until the hourly reset. Refused outright.
 *  - **Changing the box.** The demo account is the instance's first account,
 *    which makes it an administrator, which makes `/admin` and
 *    `/settings/instance` visible. That is deliberate — somebody deciding
 *    whether to run this themselves should see what administering it looks
 *    like — but nothing behind those pages may be written.
 *
 * The rules live here rather than in the routes because both areas grow: a new
 * `/admin` action, or a new better-auth endpoint that can change an identity,
 * must be covered without anybody remembering to cover it.
 */

/**
 * Endpoints that could lock the shared account, refused whatever the method.
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

	if (under(path, DEMO_FORBIDDEN)) return 'This is the demo — that cannot be changed here.';

	if (writes && path === '/settings/account' && new URLSearchParams(search).has('/delete')) {
		return 'This is the demo — the account cannot be deleted.';
	}

	if (writes && under(path, DEMO_READ_ONLY) && !under(path, DEMO_WRITABLE)) {
		// Named, not general: everything else on the demo IS editable, and a
		// message saying otherwise sends somebody away thinking the whole thing
		// is a screenshot.
		return 'The demo can look at the administration pages but not change them.';
	}

	return null;
}
