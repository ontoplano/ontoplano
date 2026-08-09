import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { toJsonError, UnauthorizedError } from '$lib/server/services/errors';
import { authenticateToken } from '$lib/server/services/tokens';

/**
 * Token introspection — lets a producer verify its credentials and discover
 * the user's timezone during setup, without needing any other scope.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const header = event.request.headers.get('authorization') ?? '';
		const now = new Date();

		if (header.toLowerCase().startsWith('bearer ')) {
			const token = authenticateToken(header.slice(7).trim(), now);
			const ctx = buildCtx(token.userId, { now });
			return Response.json({ user_id: token.userId, scopes: token.scopes, timezone: ctx.tz });
		}

		if (event.locals.user) {
			const ctx = buildCtx(event.locals.user.id, { now });
			return Response.json({
				user_id: event.locals.user.id,
				scopes: ['session'],
				timezone: ctx.tz
			});
		}

		throw new UnauthorizedError('Provide a bearer token or sign in');
	} catch (e) {
		return toJsonError(e);
	}
};
