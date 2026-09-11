/**
 * The self-contained instance's server: the database and the services, in the only
 * place the browser will let them live together.
 *
 * SQLite writes to OPFS through `createSyncAccessHandle`, which exists in a
 * dedicated worker and nowhere else — not on the page, and not in the service
 * worker. So the database is a worker, the services (synchronous over
 * Drizzle, exactly as on the server) run in here beside it, and everything
 * else asks by message. That is a constraint rather than a preference, and it
 * decides the shape of the whole self-contained instance.
 */
import * as schema from '$lib/db/schema.js';
import { bindDb } from '$lib/db/index.js';
import { buildCtx } from '$lib/services/ctx.js';
import { createTodo, listTodos } from '$lib/services/todos.js';
import { wasmClient, type Oo1Db } from './wasm-client.js';
import { DB_FILE, SELF_CONTAINED_USER_ID, POOL_NAME } from './config.js';
import {
	runSelfContainedAction,
	runSelfContainedEndpoint,
	runSelfContainedLoad
} from './routes.js';

type Request = { id: number; op: string; args?: unknown };
type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

let tables = 0;

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
	const pool = await (
		sqlite3 as unknown as {
			installOpfsSAHPoolVfs: (o: { name: string }) => Promise<{
				OpfsSAHPoolDb: new (path: string) => Oo1Db;
			}>;
		}
	).installOpfsSAHPoolVfs({ name: POOL_NAME });

	const db = new pool.OpfsSAHPoolDb(DB_FILE);
	// The same promise the server makes: a row cannot point at nothing.
	db.exec('pragma foreign_keys = on');

	/*
	 * The app's own migrations, unchanged.
	 *
	 * This is what makes the self-contained instance wiring rather than a rewrite: the
	 * schema is the schema the server runs, read straight out of `drizzle/`,
	 * in order, split on the marker drizzle writes between statements.
	 */
	const files = import.meta.glob('/drizzle/*.sql', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>;

	const applied = db.selectValue("select count(*) from sqlite_master where type='table'") as number;
	if (applied === 0) {
		for (const path of Object.keys(files).sort()) {
			for (const statement of files[path].split('--> statement-breakpoint')) {
				const sql = statement.trim();
				if (sql) db.exec(sql);
			}
		}
	}

	db.exec({
		sql: 'insert or ignore into user (id, name, email) values (?, ?, ?)',
		bind: [SELF_CONTAINED_USER_ID, SELF_CONTAINED_USER_ID, `${SELF_CONTAINED_USER_ID}@localhost`]
	});

	tables = db.selectValue(
		"select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'"
	) as number;

	// From here on the services see this database, through the same driver
	// and the same binding the server uses. Nothing below this line is
	// self-contained-instance code; it is the app.
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	bindDb(drizzle(wasmClient(db) as never, { schema }));
	return db;
}

const ctx = () => buildCtx(SELF_CONTAINED_USER_ID);

/**
 * What the page may ask for, by name.
 *
 * Real services, real validation, real errors — the entries here are the
 * dispatcher's vocabulary, and each one is a line, because the logic already
 * exists. Grows with the routes the self-contained instance serves.
 */
const ops: Record<string, (args: never) => unknown> = {
	status: () => ({ vfs: `opfs-sahpool, ${tables} tables`, tables }),
	'todos.list': () => listTodos(ctx()),
	'todos.create': (args: { title: unknown }) => createTodo(ctx(), { title: args.title }),
	// The dispatcher: the fetch bridge hands over the app's own data and
	// action requests, and these run the same load/action bodies the server
	// route would, out of `page.self-contained.ts` / `layout.self-contained.ts` twins.
	'route.load': (args: { pathname: string; search: string; cookie?: string }) =>
		runSelfContainedLoad(args.pathname, args.search, args.cookie),
	'route.action': (args: {
		pathname: string;
		search: string;
		action: string;
		form: [string, string][];
	}) => runSelfContainedAction(args.pathname, args.search, args.action, args.form),
	'route.endpoint': (args: {
		method: string;
		pathname: string;
		search: string;
		body: string | null;
		contentType: string | null;
	}) =>
		runSelfContainedEndpoint(args.method, args.pathname, args.search, args.body, args.contentType)
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
