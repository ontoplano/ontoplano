import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

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
 */
export const GET: RequestHandler = async () => {
	const started = Date.now();

	let ok = true;
	let database = 'ok';

	try {
		db.get(sql`select 1`);
	} catch (error) {
		ok = false;
		database = error instanceof Error ? error.message.slice(0, 200) : 'unavailable';
	}

	return new Response(
		JSON.stringify({
			ok,
			database,
			uptimeSeconds: Math.round(process.uptime()),
			checkedInMs: Date.now() - started
		}),
		{
			status: ok ? 200 : 503,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		}
	);
};
