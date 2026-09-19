import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { NotFoundError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';
import { read } from '$lib/services/audio';
import { recordingReferrers } from '$lib/services/media-referrers';
import { host } from '$lib/services/host';

/**
 * One recording, to the one account it belongs to.
 *
 * The same bargain the picture endpoint beside this makes. Ownership lives in
 * the service's `WHERE`, so a stranger's id and a picture's id are both the
 * same 404 — there is no arithmetic anybody can do on these numbers.
 *
 * The headers are the other half. `nosniff` stops a browser deciding for itself
 * that bytes typed as audio are really a document; `attachment` rather than
 * `inline` because nothing here needs to be *rendered* — the page plays it
 * through an `<audio>` element pointed at this URL, and a container that lies
 * about its insides is then noise rather than a document on this origin.
 */
/** One sentence for every way this can refuse: an id tells nobody anything. */
const NO_SUCH = 'No such recording.';

export const GET: RequestHandler = async (event) => {
	try {
		const id = Number(event.params.id);
		if (!Number.isInteger(id) || id <= 0) throw new NotFoundError(NO_SUCH);

		/*
		 * The same bargain the picture endpoint makes: a key gets in when what
		 * the recording is used for is something it may read — one inside a
		 * note answers to `notes:read`, one on an idea to `ideas:read`, one on
		 * a task to `tasks:read`.
		 */
		let userId = event.locals.user?.id ?? null;
		if (!userId) {
			let caller;
			try {
				caller = host.fileCaller(event.request);
			} catch {
				throw new NotFoundError(NO_SUCH);
			}
			if (!caller) throw new NotFoundError(NO_SUCH);
			if (!caller.mayRead(recordingReferrers(buildCtx(caller.userId), id)))
				throw new NotFoundError(NO_SUCH);
			userId = caller.userId;
		}

		const held = read(buildCtx(userId), id);

		return new Response(held.bytes as unknown as BodyInit, {
			headers: {
				'content-type': held.mime,
				'content-length': String(held.bytes.length),
				'x-content-type-options': 'nosniff',
				// The name is the service's, already stripped of anything that
				// could steer a header. Quoted, and never the caller's string.
				'content-disposition': `inline; filename="recording-${id}"`,
				// A row here never changes: a different recording is a different id.
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch (e) {
		return toJsonError(e);
	}
};
