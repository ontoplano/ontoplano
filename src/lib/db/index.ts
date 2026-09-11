/**
 * The database handle, wherever the instance happens to run.
 *
 * The services are written against this one binding and do not know what is
 * behind it. On the server it is better-sqlite3, bound by
 * `$lib/server/db/index.ts` the moment the file is opened; on a local
 * instance it is SQLite compiled to WASM, bound by the worker that owns the
 * OPFS file. Nothing here opens anything — a module that can run in a browser
 * cannot import the native driver, so whoever owns the real connection
 * constructs the Drizzle instance and hands it over.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Loud, immediate, and named: a service reached for the database before
 * anything had bound one. The fix is always in the caller's setup — the
 * server binds in `$lib/server/db`, a test binds through `tests/helpers/db`,
 * the local instance binds in its worker.
 */
const unbound = new Proxy({} as Db, {
	get(_target, property) {
		throw new Error(
			`No database is bound to this runtime (asked for '${String(property)}'). ` +
				'Import $lib/server/db before the services, or bind one with bindDb().'
		);
	}
});

export let db: Db = unbound;

export function bindDb(instance: Db): void {
	db = instance;
}
