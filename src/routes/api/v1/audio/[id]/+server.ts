import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { get, setNotes } from '$lib/services/audio';
import { NotFoundError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';

function audioId(raw: string): number {
	const id = Number(raw);
	if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundError('No such recording.');
	return id;
}

export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'audio:read');
		return Response.json(get(ctx, audioId(event.params.id)));
	} catch (e) {
		return toJsonError(e);
	}
};

export const PATCH: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'audio:write');
		const body = await readJson(event);
		const held = setNotes(ctx, audioId(event.params.id), body.notes, body.onlyIfEmpty === true);
		return Response.json({ id: held.id, notes: held.notes });
	} catch (e) {
		return toJsonError(e);
	}
};
