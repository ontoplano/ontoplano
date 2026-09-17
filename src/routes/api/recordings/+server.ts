import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { UnauthorizedError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';
import { list } from '$lib/services/audio';

/**
 * This account's recordings, for a chooser inside something being written.
 *
 * A page rather than the API: no scope, no token, just the session — which is
 * why it answers the name and the id and nothing else. The bytes are their own
 * address and are fetched by the player when somebody presses it.
 */
export const GET: RequestHandler = async (event) => {
	try {
		if (!event.locals.user) throw new UnauthorizedError('Sign in first.');
		const ctx = buildCtx(event.locals.user.id);
		return Response.json({
			recordings: list(ctx).map((one) => ({ id: one.id, name: one.name }))
		});
	} catch (e) {
		return toJsonError(e);
	}
};
