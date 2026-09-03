import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/http-errors';
import { deletePoint } from '$lib/server/services/streams';

/** Delete a single point by its producer-supplied id. */
export const DELETE: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'streams:write');
		deletePoint(ctx, event.params.slug, decodeURIComponent(event.params.externalId));
		return new Response(null, { status: 204 });
	} catch (e) {
		return toJsonError(e);
	}
};
