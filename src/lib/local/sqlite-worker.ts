/**
 * The database, in the only place the browser will let it live.
 *
 * SQLite writes to OPFS through `createSyncAccessHandle`, which exists in a
 * dedicated worker and nowhere else — not on the page, and not in the service
 * worker. So the database is a worker, and everything that wants it asks by
 * message. That is a constraint rather than a preference, and it decides the
 * shape of the whole local instance.
 */
type Reply = { ok: true; rows: number; vfs: string } | { ok: false; error: string };

let ready: Promise<{ rows: () => number; vfs: string }> | null = null;

async function open() {
	const { default: init } = await import('@sqlite.org/sqlite-wasm');
	const sqlite3 = await (init as (o?: unknown) => Promise<never>)({
		locateFile: () => '/sqlite3.wasm'
	});

	// `opfs-sahpool`, not plain `opfs`: the plain one wants the page
	// cross-origin isolated, and those headers break the checkout overlay.
	const pool = await (
		sqlite3 as unknown as {
			installOpfsSAHPoolVfs: (o: { name: string }) => Promise<{
				OpfsSAHPoolDb: new (path: string) => {
					exec: (s: unknown) => void;
					selectValue: (s: string) => unknown;
				};
			}>;
		}
	).installOpfsSAHPoolVfs({ name: 'ontoplano-spike' });

	const db = new pool.OpfsSAHPoolDb('/spike.db');

	/*
	 * The app's own migrations, unchanged.
	 *
	 * This is the question that decides whether the local instance is wiring or
	 * a rewrite: the schema was written for the server's SQLite, and if the same
	 * files do not apply here then every table is a negotiation. They are read
	 * straight out of `drizzle/`, in order, split on the marker drizzle writes
	 * between statements.
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

	/*
	 * The one account a local instance has.
	 *
	 * `user_id` stays on every table — one codebase serves both, and the
	 * instance that pays is the multi-tenant one — so a local database is the
	 * same schema with exactly one row in `user`. The foreign keys are real and
	 * enforced here, which is how this was found: an insert without this row is
	 * refused, exactly as it would be on the server.
	 */
	db.exec({
		sql: 'insert or ignore into user (id, name, email) values (?, ?, ?)',
		bind: ['me', 'me', 'me@localhost']
	});

	const tables = db.selectValue(
		"select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'"
	) as number;

	return {
		vfs: `opfs-sahpool, ${tables} tables`,
		rows: () => {
			// A real table from the real schema, not one invented for the test.
			db.exec({
				sql: 'insert into categories (user_id, name, color) values (?, ?, ?)',
				bind: ['me', `spike-${Date.now()}`, '#1d4ed8']
			});
			return db.selectValue('select count(*) from categories') as number;
		}
	};
}

self.onmessage = async () => {
	try {
		ready ??= open();
		const handle = await ready;
		const reply: Reply = { ok: true, rows: handle.rows(), vfs: handle.vfs };
		self.postMessage(reply);
	} catch (e) {
		self.postMessage({ ok: false, error: String(e).slice(0, 300) } satisfies Reply);
	}
};
