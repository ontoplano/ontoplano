import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/http-errors';
import { deleteSubscription } from '$lib/server/services/webhooks';

export const DELETE: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'webhooks:manage');
		deleteSubscription(ctx, Number(event.params.id));
		return new Response(null, { status: 204 });
	} catch (e) {
		return toJsonError(e);
	}
};
