/**
 * The better-sqlite3 face of the WASM database.
 *
 * The services run on Drizzle's better-sqlite3 driver, whose entire demand on
 * its client is small: `prepare()` returning a statement with `run`, `all`,
 * `get` and a `raw()` view of the last two, and `transaction()` returning the
 * begin/commit wrappers. This file teaches the sqlite-wasm handle that shape,
 * which is what lets the exact same driver — same SQL, same result mapping,
 * same transaction semantics — run against a file in OPFS instead of a file
 * on a server's disk.
 */

/** The slice of sqlite-wasm's oo1 API this shim stands on. */
interface Oo1Statement {
	bind(values: unknown[]): Oo1Statement;
	step(): boolean;
	get(target: Record<string, unknown>): Record<string, unknown>;
	get(target: unknown[]): unknown[];
	reset(alsoClearBinds?: boolean): Oo1Statement;
}

export interface Oo1Db {
	prepare(sql: string): Oo1Statement;
	exec(sql: string | { sql: string; bind?: unknown[] }): void;
	selectValue(sql: string): unknown;
	changes(): number;
}

class Statement {
	#db: Oo1Db;
	#stmt: Oo1Statement;
	#rowid: Oo1Statement;

	constructor(db: Oo1Db, stmt: Oo1Statement, rowid: Oo1Statement) {
		this.#db = db;
		this.#stmt = stmt;
		this.#rowid = rowid;
	}

	#each<T>(params: unknown[], read: (s: Oo1Statement) => T): T[] {
		const rows: T[] = [];
		this.#stmt.reset();
		if (params.length) this.#stmt.bind(params);
		try {
			while (this.#stmt.step()) rows.push(read(this.#stmt));
		} finally {
			// Always released: a statement left stepped holds its read lock, and
			// the next writer would meet SQLITE_BUSY with no queue to wait in.
			this.#stmt.reset();
		}
		return rows;
	}

	all(...params: unknown[]): Record<string, unknown>[] {
		return this.#each(params, (s) => s.get({}));
	}

	get(...params: unknown[]): Record<string, unknown> | undefined {
		return this.#each(params, (s) => s.get({}))[0];
	}

	run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
		this.#each(params, () => undefined);
		this.#rowid.reset();
		this.#rowid.step();
		const lastInsertRowid = Number(this.#rowid.get([])[0]);
		this.#rowid.reset();
		return { changes: this.#db.changes(), lastInsertRowid };
	}

	/**
	 * A view, not a toggle. better-sqlite3's raw() flips the statement into
	 * array rows until told otherwise; Drizzle only ever chains it
	 * (`stmt.raw().all(...)`), so a view with the two methods it chains onto
	 * is the same contract without the statefulness.
	 */
	raw() {
		return {
			all: (...params: unknown[]): unknown[][] => this.#each(params, (s) => s.get([])),
			get: (...params: unknown[]): unknown[] | undefined => this.#each(params, (s) => s.get([]))[0]
		};
	}
}

/** What `drizzle()` from drizzle-orm/better-sqlite3 needs to be handed. */
export interface WasmClient {
	prepare(sql: string): Statement;
	transaction(fn: (...args: unknown[]) => unknown): Record<string, (...args: unknown[]) => unknown>;
}

export function wasmClient(db: Oo1Db): WasmClient {
	const rowid = db.prepare('select last_insert_rowid()');

	const wrap =
		(mode: string, fn: (...args: unknown[]) => unknown) =>
		(...args: unknown[]) => {
			db.exec(`begin ${mode}`);
			try {
				const result = fn(...args);
				db.exec('commit');
				return result;
			} catch (e) {
				db.exec('rollback');
				throw e;
			}
		};

	return {
		prepare: (sql) => new Statement(db, db.prepare(sql), rowid),
		transaction: (fn) => ({
			deferred: wrap('deferred', fn),
			immediate: wrap('immediate', fn),
			exclusive: wrap('exclusive', fn)
		})
	};
}
