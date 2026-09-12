/**
 * The constants an isolated instance is built around, in one place.
 *
 * Shared between the worker that owns the database and whatever talks to it,
 * so the two can never disagree about where the data lives or who its one
 * account is.
 */

/** The OPFS pool the SAH backend manages. Renaming it orphans the data. */
export const POOL_NAME = 'ontoplano';

/** The database file inside that pool. */
export const DB_FILE = '/ontoplano.db';

/**
 * The one account an isolated instance has.
 *
 * `user_id` stays on every table — one codebase serves both, and the instance
 * that pays is the multi-tenant one — so a local database is the same schema
 * with exactly one row in `user`.
 */
export const ISOLATED_USER_ID = 'me';

/**
 * How long the page waits for the worker before calling it broken.
 *
 * Generous: the first answer includes compiling SQLite and running every
 * migration on a phone. But finite, because past it the truthful thing is a
 * sentence about what did not answer — not a splash screen forever.
 */
export const WORKER_DEADLINE_MS = 30_000;
