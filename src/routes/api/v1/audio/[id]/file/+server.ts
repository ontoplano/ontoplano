import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { read } from '$lib/services/audio';
import { NotFoundError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';

export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'audio:read');
		const id = Number(event.params.id);
		if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundError('No such recording.');
		const held = read(ctx, id);
		return new Response(held.bytes as unknown as BodyInit, {
			headers: {
				'content-type': held.mime,
				'content-length': String(held.bytes.length),
				'x-content-type-options': 'nosniff',
				'content-disposition': `attachment; filename="recording-${id}"`,
				'cache-control': 'private, no-store'
			}
		});
	} catch (e) {
		return toJsonError(e);
	}
};
