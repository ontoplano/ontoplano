import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '$lib/db/schema.js';
import { bindDb, db as bound } from '$lib/db/index.js';
import { bindServerHost } from '../host.js';
import { loadConfig, ensureDirectories } from '../config.js';
import { assertMigrated } from './assert-migrated.js';
import { reconcileBodyLimit } from '../body-limit.js';

// A server about to serve must be migrated; a BUILD must not care. `vite
// build` loads this module on whatever machine is building, and that
// machine's database — a laptop's dev copy, usually — is allowed to be
// behind the migration that is being shipped. Deploy migrates the server
// itself before restarting it; nobody migrates by hand.
//
// `$app/environment` only exists inside Vite, and this module is also
// loaded by plain tsx scripts (the nightly reconcile, the fixtures) — the
// dynamic import fails there, which is itself the answer: a script is
// never a build, and scripts want the check.
let building = false;
/*
 * Whether this is the built server, as opposed to a dev server or a script.
 *
 * It decides one thing: whether `BODY_SIZE_LIMIT` matters. That limit belongs
 * to `adapter-node`, which is only in front of the app in a production build —
 * `vite dev` reads bodies itself and a script has no HTTP at all — so enforcing
 * it anywhere else would fail a test suite over a setting that could not
 * possibly bite it.
 */
let served = false;
try {
	const environment = await import('$app/environment');
	building = environment.building;
	served = !environment.dev && !environment.building;
} catch {
	// Outside the app: a script. The migration check applies; the body one does
	// not, because nothing here is answering a request.
}

/*
 * A build never opens the database — not the file, not even the native
 * driver, whose .node binary is the one thing here that can refuse to load
 * on a machine whose node changed underneath it. Building renders at most a
 * fallback page, and a page rendered at build time has no business reading
 * anybody's data; if one tries, the unbound handle in $lib/db refuses with
 * the reason. This is also what lets the isolated build — which has no
 * server at all — be built on a machine where better-sqlite3 cannot even
 * dlopen.
 */
if (!building) {
	ensureDirectories();
	const config = loadConfig();
	const client = new Database(config.database.path);

	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');

	assertMigrated(client, config.database.path);
	// Same moment: a setting that makes the configured picture ceiling
	// impossible is reconciled here and said out loud, rather than either
	// surfacing as an unreadable crash later or — as it did once — refusing
	// to start at all.
	if (served) reconcileBodyLimit(config.media.maxKilobytes);

	/*
	 * Which database, said out loud, once, at the top of the journal.
	 *
	 * Three instances live on one box and each is told where its database is by
	 * a file. When the wrong file wins, everything downstream is confusing in a
	 * way that does not name the cause: sign-ins refused, API tokens unknown,
	 * the real data untouched and unreachable beside it. Production spent an
	 * evening there. `journalctl -u ontoplano -n 20` answers it now.
	 */
	console.log(`ontoplano: database ${config.database.path}`);

	// The portable binding the services read. Bound here so that having a
	// server database and having the services see it are the same event.
	bindDb(drizzle(client, { schema }));
	bindServerHost();
}

// The live binding from $lib/db: the instance bound above, or — mid-build —
// the handle that refuses with an explanation.
export const db = bound;
