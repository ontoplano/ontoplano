import type { RequestHandler } from './$types';
import { timingSafeEqual } from 'node:crypto';
import { playRtdn, playConfigured } from '$lib/server/services/billing';

/**
 * Where Google's Pub/Sub tells us a subscription changed.
 *
 * The push subscription is configured with this URL carrying a shared token —
 * that token is the authentication, compared in constant time. The message
 * itself is never trusted: the handler re-fetches the purchase's state from
 * Google, so the worst a forged or replayed body can cause is a re-sync.
 *
 * Always 200 once the token checks out, whatever we did with the message: a
 * non-2xx makes Pub/Sub retry, and retrying something deliberately ignored is
 * noise on both sides.
 */
function tokenOk(given: string | null): boolean {
	const want = process.env.PLAY_RTDN_TOKEN || '';
	if (!want || !given) return false;
	const a = Buffer.from(want);
	const b = Buffer.from(given);
	return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: RequestHandler = async ({ request, url }) => {
	if (!playConfigured()) return new Response('Not found', { status: 404 });
	if (!tokenOk(url.searchParams.get('token'))) {
		return new Response('Bad token', { status: 401 });
	}

	const outcome = await playRtdn(await request.text());
	return new Response(JSON.stringify(outcome), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};
