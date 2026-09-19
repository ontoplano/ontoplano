import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { NotFoundError } from '$lib/services/errors';
import { read } from '$lib/services/media';
import { pictureReferrers } from '$lib/services/media-referrers';
import { host } from '$lib/services/host';

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
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 });

	/*
	 * A key gets in when what the picture is *used for* is something it may
	 * read: one in a note answers to `notes:read`, a face to `people:read`.
	 * A picture nothing refers to answers to nobody. See
	 * `$lib/server/api/media-access.ts` for why this is not a new grant.
	 */
	let userId = event.locals.user?.id ?? null;
	if (!userId) {
		let caller;
		try {
			caller = host.fileCaller(event.request);
		} catch {
			// A bearer header that is revoked, expired or nonsense. The same
			// 404 as everything else here: these ids tell nobody anything.
			return new Response('Not found', { status: 404 });
		}
		if (!caller) return new Response('Not found', { status: 404 });

		const ctx = buildCtx(caller.userId);
		if (!caller.mayRead(pictureReferrers(ctx, id)))
			return new Response('Not found', { status: 404 });
		userId = caller.userId;
	}

	try {
		const picture = read(buildCtx(userId), id);
		return new Response(new Uint8Array(picture.bytes), {
			headers: {
				'content-type': picture.mime,
				'content-length': String(picture.bytes.length),
				'content-disposition': `inline; filename="${picture.filename}"`,
				'x-content-type-options': 'nosniff',
				// If a row ever holds a document anyway — an old import, a bug
				// upstream — this keeps it inert when opened as a page. The
				// app's CSP is injected into rendered pages only, not into a
				// hand-built Response like this one.
				'content-security-policy': "default-src 'none'; sandbox",
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch (e) {
		if (e instanceof NotFoundError) return new Response('Not found', { status: 404 });
		throw e;
	}
};
