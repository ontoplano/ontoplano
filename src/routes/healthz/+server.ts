import type { RequestHandler } from './$types';
import { databaseReachable, resources, tokenMatches, warnings } from '$lib/server/services/health';
import { build } from '$lib/server/services/version';
import { healthToken } from '$lib/server/settings';

/**
 * Is this box alive, and is it actually able to work?
 *
 * A process that is listening is not the same as a process that can serve, and
 * on a small machine the difference is the whole problem: the disk fills, or
 * SQLite is locked by a backup, and every page 500s while the port stays open.
 * So this touches the database rather than answering from memory.
 *
 * No session and no auth, because whatever is watching this is not logged in
 * and should not have to be. It says nothing an attacker could not learn by
 * loading the login page.
 *
 * The disk and memory numbers are the exception, and they are behind a token.
 * "This box is 94% full" is a sentence that tells somebody exactly which
 * attack is cheap today, so it is for the machine that is watching and nobody
 * else. Set `ONTOPLANO_HEALTH_TOKEN` and send it as `x-health-token` or
 * `?token=`; without one configured, nothing is ever disclosed.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const started = Date.now();

	const want = healthToken();
	const given = request.headers.get('x-health-token') ?? url.searchParams.get('token');
	const trusted = tokenMatches(want, given);

	const database = databaseReachable();
	const ok = database === 'ok';

	// The resource numbers never decide `ok`. A disk at 90% is something to be
	// woken up about; it is not a reason to tell a load balancer to take the
	// site out of rotation while it is still serving every request correctly.
	const detail = trusted ? resources() : null;

	return new Response(
		JSON.stringify({
			ok,
			database,
			uptimeSeconds: Math.round(process.uptime()),
			checkedInMs: Date.now() - started,
			// Which build is answering, for the same audience as the numbers: the
			// machine watching this wants to say "still on 0.2.0" without an ssh
			// session, and a version string tells a stranger which bugs to try.
			...(detail ? { resources: detail, warnings: warnings(detail), build: build() } : {})
		}),
		{
			status: ok ? 200 : 503,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		}
	);
};
