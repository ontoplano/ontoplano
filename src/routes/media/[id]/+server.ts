import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/server/services/ctx';
import { NotFoundError } from '$lib/server/services/errors';
import { read } from '$lib/server/services/media';

/**
 * One picture, to the one account it belongs to.
 *
 * The ownership is in the service's `WHERE`, so a signed-in stranger asking for
 * somebody else's id gets the same 404 as an id that never existed — there is
 * no arithmetic anybody can do on these numbers.
 *
 * The headers are the other half. `nosniff` stops a browser from deciding for
 * itself that a file the service typed as an image is really a document;
 * `Content-Disposition: inline` with a filename we sanitised keeps a crafted
 * name from steering the header; `sandbox` is not needed because the type
 * allowlist has no format that can execute anything.
 *
 * Cached hard and privately: a row here never changes — a different picture is
 * a different id — so a browser may keep it for as long as it likes, and no
 * shared cache may keep it at all.
 */
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) return new Response('Not found', { status: 404 });

	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 });

	try {
		const picture = read(buildCtx(event.locals.user.id), id);
		return new Response(new Uint8Array(picture.bytes), {
			headers: {
				'content-type': picture.mime,
				'content-length': String(picture.bytes.length),
				'content-disposition': `inline; filename="${picture.filename}"`,
				'x-content-type-options': 'nosniff',
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch (e) {
		if (e instanceof NotFoundError) return new Response('Not found', { status: 404 });
		throw e;
	}
};
