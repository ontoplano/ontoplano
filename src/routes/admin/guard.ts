import { error, type RequestEvent } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/services/admin';

/**
 * The layout gates the pages, but SvelteKit does not run `load` for a POSTed
 * form action — an action is reachable on its own, by anybody who can send a
 * same-origin POST. So the actions are gated here, by wrapping the lot, rather
 * than by a line at the top of each that somebody has to remember to write.
 *
 * A 404 rather than a 403, matching the layout: a page you may not see should
 * not confirm that it exists (I3).
 */
export function requireAdminOr404(userId: string | undefined): void {
	if (!userId || !isAdmin(userId)) error(404, 'Not found');
}

export function adminActions<T extends Record<string, (event: never) => unknown>>(actions: T): T {
	const wrapped: Record<string, unknown> = {};
	for (const [name, action] of Object.entries(actions)) {
		wrapped[name] = (event: RequestEvent) => {
			requireAdminOr404(event.locals.user?.id);
			return (action as (event: RequestEvent) => unknown)(event);
		};
	}
	return wrapped as T;
}
