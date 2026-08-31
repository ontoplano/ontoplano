import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { readJson } from '$lib/server/api/auth';
import { clientKey, rateLimit } from '$lib/server/rate-limit';
import { buildCtx } from '$lib/server/services/ctx';
import {
	recordClientError,
	recordVisitorError,
	setClientErrorConsent
} from '$lib/server/services/client-errors';
import { toJsonError } from '$lib/server/services/errors';

/**
 * Where the page sends what broke, and the answer it was given.
 *
 * Session-authenticated like `/api/search` — this exists for the page that is
 * already open, not for a plugin. One body, two shapes: `{ decision }` records
 * the person's yes or no, `{ error }` is a report, accepted only after a yes —
 * or with `once`, which is the error page's own button and speaks for that one
 * report only.
 */
export const POST: RequestHandler = async (event) => {
	/*
	 * A visitor with no account can report too, and only by pressing the button.
	 *
	 * This used to answer 401 without a session, which made the landing page —
	 * the page a stranger sees — the one page whose crashes could never be
	 * heard about. There is no stored preference for somebody with no account,
	 * so `once` is required: the report exists because they chose to send it.
	 * Keyed on the address for the rate limit, since there is no account to key
	 * on.
	 */
	const who = event.locals.user?.id ?? `anon:${clientKey(event.request, event.getClientAddress)}`;

	// A broken page can throw in a loop; the log should not be its victim.
	const { allowed } = rateLimit(`clienterr:${who}`, 20, 3_600_000);
	if (!allowed) return new Response(null, { status: 429 });

	try {
		const body = await readJson(event);

		if (!event.locals.user) {
			if (body.once !== true) return json({ error: 'Sign in first' }, { status: 401 });
			recordVisitorError(
				{
					...((body.error ?? {}) as Record<string, unknown>),
					userAgent: event.request.headers.get('user-agent') ?? undefined
				},
				new Date()
			);
			return new Response(null, { status: 204 });
		}

		const ctx = buildCtx(event.locals.user.id);

		if (body.decision !== undefined) {
			setClientErrorConsent(ctx, body.decision);
		} else {
			// Taken from the request rather than from the page: which browser it
			// was is the first thing anybody asks about a bug that only happens
			// to one person, and a page that sends its own can send anything.
			recordClientError(
				ctx,
				{
					...((body.error ?? {}) as Record<string, unknown>),
					userAgent: event.request.headers.get('user-agent') ?? undefined
				},
				{ once: body.once === true }
			);
		}

		return new Response(null, { status: 204 });
	} catch (e) {
		return toJsonError(e);
	}
};
