import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/http-errors';
import { listStreams, serialiseStream, upsertStream } from '$lib/server/services/streams';

/** List the caller's streams. */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'streams:read');
		return Response.json({ streams: listStreams(ctx).map(serialiseStream) });
	} catch (e) {
		return toJsonError(e);
	}
};

/** Declare a stream. Idempotent per slug — safe to call at every producer startup. */
export const POST: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'streams:write');
		const body = await readJson(event);
		const { stream, created } = upsertStream(ctx, body);
		return Response.json({ ...serialiseStream(stream), created }, { status: created ? 201 : 200 });
	} catch (e) {
		return toJsonError(e);
	}
};
