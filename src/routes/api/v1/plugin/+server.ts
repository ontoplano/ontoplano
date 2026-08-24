import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { deleteManifest, listManifests, upsertManifest } from '$lib/server/services/plugins';

/** The manifests this account has been given. */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'plugin:declare');
		return Response.json({ plugins: listManifests(ctx.userId) });
	} catch (e) {
		return toJsonError(e);
	}
};

/**
 * Declare what this plugin understands. Idempotent per source, so a producer
 * can call it at every startup and the newest version's vocabulary wins.
 */
export const PUT: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'plugin:declare');
		const body = await readJson(event);
		return Response.json(upsertManifest(ctx.userId, body as { source: string }));
	} catch (e) {
		return toJsonError(e);
	}
};

/** Withdraw a manifest. The metadata keys keep working; they just lose their label. */
export const DELETE: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'plugin:declare');
		const source = event.url.searchParams.get('source') ?? '';
		if (!source)
			return Response.json({ error: { message: 'source is required' } }, { status: 422 });
		deleteManifest(ctx.userId, source);
		return new Response(null, { status: 204 });
	} catch (e) {
		return toJsonError(e);
	}
};
