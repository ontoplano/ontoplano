import type { RequestHandler } from './$types';

import { buildCtx } from '$lib/services/ctx';
import { UnauthorizedError } from '$lib/services/errors';
import { toJsonError } from '$lib/http-errors';
import { markAllRead, markRead, unreadCount } from '$lib/services/sent-notifications';

/**
 * Marking notifications read.
 *
 * Two shapes, because there are two ways of seeing one: opening the list sees
 * all of them at once, and following one sees that one. A POST rather than a
 * form action because the bell is in the shell — it has no page of its own to
 * hang an action on, and every page in the app is behind it.
 *
 * Answers the count back, so the badge is what the database says rather than
 * what the browser guessed after pressing something.
 */
export const POST: RequestHandler = async (event) => {
	try {
		if (!event.locals.user) throw new UnauthorizedError('Sign in first.');
		const ctx = buildCtx(event.locals.user.id);

		const asked = (await event.request.json().catch(() => ({}))) as { id?: unknown };
		if (asked.id === undefined || asked.id === null) markAllRead(ctx);
		else markRead(ctx, Number(asked.id));

		return Response.json({ unread: unreadCount(ctx) });
	} catch (e) {
		return toJsonError(e);
	}
};
