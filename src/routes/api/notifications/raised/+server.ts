import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { UnauthorizedError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';
import { record } from '$lib/services/sent-notifications';

/**
 * Something the app told you itself, written down.
 *
 * Most notifications come from the server, and `pushToUser` records every one
 * on its way out. A reminder that comes due while a page is open does not: the
 * page raises it (`Reminders.svelte`), and the phone's own alarms do the same.
 * Nothing was sent, so nothing was recorded — and the bell list then held a
 * reminder or not depending on whether the app happened to be open when it
 * fired, which is the one thing that should make no difference.
 *
 * So the page says so. The row goes in already read: you were looking at the
 * screen when it appeared, so it belongs in "what was I told today" and does
 * not belong in the count of things waiting on you.
 *
 * Idempotent by `key` rather than by luck. Push and the page can both raise
 * the same reminder — the notification `tag` already stops two appearing on
 * screen, and this stops two rows.
 */
export const POST: RequestHandler = async (event) => {
	try {
		if (!event.locals.user) throw new UnauthorizedError('Sign in first.');
		const ctx = buildCtx(event.locals.user.id);

		const said = (await event.request.json().catch(() => ({}))) as {
			title?: unknown;
			body?: unknown;
			url?: unknown;
			kind?: unknown;
		};

		const title = String(said.title ?? '').trim();
		// Nothing to write down, and nothing worth an error either: a page that
		// raised something empty has a bug of its own.
		if (!title) return Response.json({ recorded: false });

		record(ctx.userId, {
			title,
			body: typeof said.body === 'string' ? said.body : '',
			url: typeof said.url === 'string' ? said.url : null,
			kind: typeof said.kind === 'string' ? said.kind : 'reminder',
			seen: true
		});

		return Response.json({ recorded: true });
	} catch (e) {
		return toJsonError(e);
	}
};
