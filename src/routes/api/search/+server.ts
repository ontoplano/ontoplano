import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { search } from '$lib/server/services/search';

/**
 * Search, for the command palette.
 *
 * Session-authenticated like the rest of the app rather than token-based like
 * `/api/v1` — this exists for the page that is already open, not for a plugin.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ hits: [] }, { status: 401 });

	const hits = search(buildCtx(locals.user.id), url.searchParams.get('q'));
	return json({ hits });
};
