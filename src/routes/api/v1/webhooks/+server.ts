import type { RequestHandler } from './$types';

import { authenticateApi, readJson } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import {
	createSubscription,
	listSubscriptions,
	serialiseNewSubscription,
	serialiseSubscription
} from '$lib/server/services/webhooks';

/** List the caller's webhook subscriptions. */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'webhooks:manage');
		return Response.json({ webhooks: listSubscriptions(ctx).map(serialiseSubscription) });
	} catch (e) {
		return toJsonError(e);
	}
};

/**
 * Subscribe an address to events.
 *
 * The response carries the secret deliveries are signed with — keep it, and
 * verify `X-Ontoplano-Signature` (`sha256=` + HMAC-SHA256 of the raw body).
 */
export const POST: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'webhooks:manage');
		const body = await readJson(event);
		const subscription = createSubscription(ctx, { url: body.url, events: body.events });
		// The one place the secret is ever sent: keep it, there is no second
		// chance to read it and nothing to rotate it with.
		return Response.json(serialiseNewSubscription(subscription), { status: 201 });
	} catch (e) {
		return toJsonError(e);
	}
};
