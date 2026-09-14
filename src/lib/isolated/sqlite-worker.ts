/**
 * The isolated instance's server: the database and the services, in the only
 * place the browser will let them live together.
 *
 * SQLite writes to OPFS through `createSyncAccessHandle`, which exists in a
 * dedicated worker and nowhere else — not on the page, and not in the service
 * worker. So the database is a worker, the services (synchronous over
 * Drizzle, exactly as on the server) run in here beside it, and everything
 * else asks by message. That is a constraint rather than a preference, and it
 * decides the shape of the whole isolated instance.
 */
import * as schema from '$lib/db/schema.js';

import { installBufferStandIn } from './buffer-stand-in.js';
import { bindDb } from '$lib/db/index.js';
import { buildCtx } from '$lib/services/ctx.js';
import { createTodo, listTodos } from '$lib/services/todos.js';
import { deleteAccount } from '$lib/services/account-data.js';
import { read as readPicture } from '$lib/services/media.js';
import { wasmClient, type Oo1Db } from './wasm-client.js';
import { migrateDevice } from './device-migrations.js';
import { DB_FILE, ISOLATED_USER_ID, POOL_NAME } from './config.js';
import { runIsolatedAction, runIsolatedEndpoint, runIsolatedLoad } from './routes.js';

/*
 * Before any row is read.
 *
 * Drizzle's blob column reaches for Node's `Buffer` the moment a picture
 * comes back out of SQLite, and this is the one runtime here that has none.
 * Import order would not be enough — imports are evaluated before any
 * statement in this file — but nothing touches `Buffer` while it is being
 * imported, only later when a row is mapped.
 */
installBufferStandIn();

type Request = { id: number; op: string; args?: unknown };
type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

let tables = 0;

/**
 * The pool of files this instance lives in, kept so it can be emptied.
 *
 * Deleting an account on a server leaves the server; deleting one here has to
 * leave nothing at all, and the rows are only half of that — the file they
 * were in is the other half. See `destroy` below.
 */
let pool: { OpfsSAHPoolDb: new (path: string) => Oo1Db; wipeFiles: () => Promise<void> } | null =
	null;

async function open(): Promise<Oo1Db> {
	// Said out loud before anything is attempted: a WebView too old for
	// private file storage would otherwise fail somewhere deep in SQLite's
	// setup, or not fail at all — and an eternal splash screen is the worst
	// of all error messages.
	if (typeof navigator.storage?.getDirectory !== 'function')
		throw new Error(
			'This browser cannot keep the database: it has no origin-private file ' +
				'storage. A system WebView (or Chrome) from 2022 or newer is needed. ' +
				`Here: ${navigator.userAgent}`
		);

	const { default: init } = await import('@sqlite.org/sqlite-wasm');
	const sqlite3 = await (init as (o?: unknown) => Promise<never>)({
		locateFile: () => '/sqlite3.wasm'
	});

	// `opfs-sahpool`, not plain `opfs`: the plain one wants the page
	// cross-origin isolated, and those headers break the checkout overlay.
	const oo1 = (sqlite3 as unknown as { oo1: { DB: new (path: string) => Oo1Db } }).oo1;

	pool = await (
		sqlite3 as unknown as {
			installOpfsSAHPoolVfs: (o: { name: string }) => Promise<{
				OpfsSAHPoolDb: new (path: string) => Oo1Db;
				wipeFiles: () => Promise<void>;
			}>;
		}
	).installOpfsSAHPoolVfs({ name: POOL_NAME });

	const db = new pool.OpfsSAHPoolDb(DB_FILE);

	/*
	 * The app's own migrations, unchanged.
	 *
	 * This is what makes the isolated instance wiring rather than a rewrite: the
	 * schema is the schema the server runs, read straight out of `drizzle/`,
	 * in order, split on the marker drizzle writes between statements.
	 *
	 * They used to run only when the database was empty, which meant a device
	 * was frozen at the schema of the build that first opened it: every release
	 * after that shipped code expecting columns the phone did not have, and the
	 * rooms that needed them simply broke. A phone-only instance has nobody to
	 * run a migration for it, so it runs its own.
	 */
	const files = import.meta.glob('/drizzle/*.sql', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>;

	// The scratch database the migrator places this device against: plain
	// in-memory, no VFS, thrown away the moment it has served.
	migrateDevice(db, files, () => new oo1.DB(':memory:'));

	db.exec({
		sql: 'insert or ignore into user (id, name, email) values (?, ?, ?)',
		bind: [ISOLATED_USER_ID, ISOLATED_USER_ID, `${ISOLATED_USER_ID}@localhost`]
	});

	tables = db.selectValue(
		"select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'"
	) as number;

	// From here on the services see this database, through the same driver
	// and the same binding the server uses. Nothing below this line is
	// isolated-instance code; it is the app.
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	bindDb(drizzle(wasmClient(db) as never, { schema }));
	return db;
}

const ctx = () => buildCtx(ISOLATED_USER_ID);

/**
 * What the page may ask for, by name.
 *
 * Real services, real validation, real errors — the entries here are the
 * dispatcher's vocabulary, and each one is a line, because the logic already
 * exists. Grows with the routes the isolated instance serves.
 */
const ops: Record<string, (args: never) => unknown> = {
	status: () => ({ vfs: `opfs-sahpool, ${tables} tables`, tables }),
	/**
	 * Unmake this instance: the rows, then the file they were in.
	 *
	 * The account page's own action deletes the rows, which is the honest walk
	 * over every table holding user data and the same one a server does. This
	 * is what a device has in addition — there is no server to go on existing
	 * afterwards, so the storage goes too and what is left is a phone with the
	 * app on it and no instance inside.
	 */
	'db.destroy': async () => {
		deleteAccount(ISOLATED_USER_ID);
		await pool?.wipeFiles();
		return { gone: true };
	},
	'todos.list': () => listTodos(ctx()),
	'todos.create': (args: { title: unknown }) => createTodo(ctx(), { title: args.title }),
	// The dispatcher: the fetch bridge hands over the app's own data and
	// action requests, and these run the same load/action bodies the server
	// route would — the very same `+page.server.ts` files.
	/*
	 * One picture's bytes.
	 *
	 * Not part of the route dispatcher: `<img src="/media/3">` is not a fetch
	 * the page makes, so the bridge never sees it. The service worker does,
	 * and asks the page, which asks this. See `$lib/isolated/pictures.ts`.
	 */
	'media.read': (args: { id: number }) => readPicture(ctx(), args.id),
	'route.load': (args: { pathname: string; search: string; cookie?: string }) =>
		runIsolatedLoad(args.pathname, args.search, args.cookie),
	'route.action': (args: {
		pathname: string;
		search: string;
		action: string;
		form: [string, FormDataEntryValue][];
	}) => runIsolatedAction(args.pathname, args.search, args.action, args.form),
	'route.endpoint': (args: {
		method: string;
		pathname: string;
		search: string;
		body: string | null;
		contentType: string | null;
		form?: [string, FormDataEntryValue][];
	}) =>
		runIsolatedEndpoint(
			args.method,
			args.pathname,
			args.search,
			args.body,
			args.contentType,
			args.form
		)
};

let ready: Promise<Oo1Db> | null = null;

self.onmessage = async (event: MessageEvent<Request>) => {
	const { id, op, args } = event.data;
	try {
		ready ??= open();
		await ready;
		const handler = ops[op];
		if (!handler) throw new Error(`No such operation: ${op}`);
		const reply: Reply = { id, ok: true, result: await handler(args as never) };
		self.postMessage(reply);
	} catch (e) {
		const reply: Reply = { id, ok: false, error: String(e).slice(0, 500) };
		self.postMessage(reply);
	}
};
