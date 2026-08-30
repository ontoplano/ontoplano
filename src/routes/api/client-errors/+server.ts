import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { readJson } from '$lib/server/api/auth';
import { rateLimit } from '$lib/server/rate-limit';
import { buildCtx } from '$lib/server/services/ctx';
import { recordClientError, setClientErrorConsent } from '$lib/server/services/client-errors';
import { toJsonError } from '$lib/server/services/errors';

/**
 * Where the page sends what broke, and the answer it was given.
 *
 * Session-authenticated like `/api/search` — this exists for the page that is
 * already open, not for a plugin. One body, two shapes: `{ decision }` records
 * the person's yes or no, `{ error }` is a report, accepted only after a yes.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) return json({ error: 'Sign in first' }, { status: 401 });

	// A broken page can throw in a loop; the log should not be its victim.
	const { allowed } = rateLimit(`clienterr:${event.locals.user.id}`, 20, 3_600_000);
	if (!allowed) return new Response(null, { status: 429 });

	try {
		const body = await readJson(event);
		const ctx = buildCtx(event.locals.user.id);

		if (body.decision !== undefined) {
			setClientErrorConsent(ctx, body.decision);
		} else {
			// Taken from the request rather than from the page: which browser it
			// was is the first thing anybody asks about a bug that only happens
			// to one person, and a page that sends its own can send anything.
			recordClientError(ctx, {
				...((body.error ?? {}) as Record<string, unknown>),
				userAgent: event.request.headers.get('user-agent') ?? undefined
			});
		}

		return new Response(null, { status: 204 });
	} catch (e) {
		return toJsonError(e);
	}
};
