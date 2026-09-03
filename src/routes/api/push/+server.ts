import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { removeSubscription, saveSubscription } from '$lib/server/services/push';
import { toJsonError } from '$lib/server/http-errors';

/**
 * A browser signing itself up to be interrupted, or asking to stop.
 *
 * Session-authenticated like `/api/reminders` rather than token-based: the
 * caller is the page somebody has open, and the account is taken from that
 * session rather than from the body — a subscription belongs to whoever was
 * signed in when their browser said yes, and nothing a page sends can make it
 * belong to anybody else.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ ok: false }, { status: 401 });

	const body = (await request.json().catch(() => null)) as {
		subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
		label?: string;
	} | null;
	if (!body?.subscription) return json({ ok: false }, { status: 400 });

	try {
		saveSubscription(buildCtx(locals.user.id), body.subscription, body.label);
	} catch (e) {
		return toJsonError(e);
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ ok: false }, { status: 401 });

	const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
	if (!body?.endpoint) return json({ ok: false }, { status: 400 });

	return json({ ok: removeSubscription(buildCtx(locals.user.id), body.endpoint) });
};
