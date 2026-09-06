import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { playClaim, playConfigured } from '$lib/server/services/billing';
import { toJsonError } from '$lib/server/http-errors';

/**
 * The store copy hands over its purchase.
 *
 * The purchase already happened on the device, inside Play's own sheet — what
 * arrives here is the purchase token, and the only trustworthy thing to do
 * with it is ask Google. The claim verifies the token, checks it is for the
 * plan the client says it bought, acknowledges it (Play refunds anything
 * unacknowledged after three days), and writes the entitlement. Signed-in
 * only: a purchase belongs to the account that made it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response('Sign in first', { status: 401 });
	if (!playConfigured()) return new Response('Not found', { status: 404 });

	try {
		const body = (await request.json()) as { sku?: unknown; purchaseToken?: unknown };
		const result = await playClaim(locals.user.id, {
			sku: String(body.sku ?? ''),
			purchaseToken: String(body.purchaseToken ?? '')
		});
		return json({ ok: true, ...result });
	} catch (e) {
		return toJsonError(e);
	}
};
