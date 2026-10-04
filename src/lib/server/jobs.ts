import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { tokenMatches } from '$lib/server/services/health';
import { markJobRan } from '$lib/server/services/companions';

/**
 * A job the box asks the running process to do — the minute's reminders,
 * the hour's review mail — rather than booting a second copy of everything.
 *
 * Behind the health token, which the box already has for `/healthz`: a job
 * writes and sends, so it is not for the public. No token configured means no
 * way in, rather than a way in for everybody. The instance page reads the
 * stamp `markJobRan` writes, so "last asked a minute ago" is answerable
 * whatever did the asking — systemd, the container, or a curl.
 *
 * `run` answers with what it did, or with a refusal of its own as a Response.
 */
export function jobEndpoint(
	name: string,
	run: (url: URL) => Promise<Record<string, unknown> | Response>
): RequestHandler {
	return async ({ request, url }) => {
		const want = process.env.ONTOPLANO_HEALTH_TOKEN ?? '';
		const given = request.headers.get('x-health-token') ?? url.searchParams.get('token');
		if (!want || !tokenMatches(want, given)) return json({ ok: false }, { status: 404 });

		markJobRan(name);

		const result = await run(url);
		return result instanceof Response ? result : json({ ok: true, ...result });
	};
}
