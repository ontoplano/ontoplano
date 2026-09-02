import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import { loadConfig, ensureDirectories } from '../config.js';
import { assertMigrated } from './assert-migrated.js';
import { reconcileBodyLimit } from './assert-body-limit.js';

ensureDirectories();
const config = loadConfig();
const client = new Database(config.database.path);

client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

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
if (!building) assertMigrated(client, config.database.path);
// Same moment: a setting that makes the configured picture ceiling impossible
// is reconciled here and said out loud, rather than either surfacing as an
// unreadable crash later or — as it did once — refusing to start at all.
if (served) reconcileBodyLimit(config.media.maxKilobytes);

export const db = drizzle(client, { schema });
