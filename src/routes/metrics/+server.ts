import type { RequestHandler } from './$types';
import { registry } from '$lib/server/metrics';
import { healthToken } from '$lib/server/settings';
import { tokenMatches } from '$lib/server/services/health';

/**
 * The numbers `$lib/server/metrics` keeps, for whatever collects them.
 *
 * Behind the same token as `/healthz`'s detail, for the same reason: which
 * routes are slow and what the process weighs tells somebody which request
 * to send a thousand times. Sent as `Authorization: Bearer …` — what a
 * Prometheus scrape config writes — or as `x-health-token`. With no token
 * configured this route does not exist.
 */
export const GET: RequestHandler = async ({ request }) => {
	const want = healthToken();
	if (!want) return new Response('Not found', { status: 404 });
	const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
	const given = request.headers.get('x-health-token') ?? bearer;
	if (!tokenMatches(want, given)) return new Response('Not found', { status: 404 });

	return new Response(await registry.metrics(), {
		headers: { 'content-type': registry.contentType, 'cache-control': 'no-store' }
	});
};
