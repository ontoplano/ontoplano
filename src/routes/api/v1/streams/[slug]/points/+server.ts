import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { listPoints, pushPoints, serialisePoint } from '$lib/server/services/streams';

/**
 * Push points. Batch, idempotent, partial success.
 *
 * Re-sending an already-stored point is reported under `duplicates` and is not
 * an error — producers should treat it as success and mark the reading synced.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'streams:write');
		const body = await readJson(event);
		const result = pushPoints(ctx, event.params.slug, body.points);
		return Response.json(result);
	} catch (e) {
		return toJsonError(e);
	}
};

/** Read points back, for reconciliation or charting. */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'streams:read');
		const q = event.url.searchParams;
		const points = listPoints(ctx, event.params.slug, {
			since: q.get('since') ?? undefined,
			until: q.get('until') ?? undefined,
			limit: q.get('limit') ? Number(q.get('limit')) : undefined,
			order: q.get('order') === 'desc' ? 'desc' : 'asc'
		});
		return Response.json({ points: points.map(serialisePoint), count: points.length });
	} catch (e) {
		return toJsonError(e);
	}
};
