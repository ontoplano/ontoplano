/**
 * The migrator that runs on the phone, against a real SQLite file.
 *
 * The isolated instance has no server to migrate it, so it walks `drizzle/`
 * itself — and the first version of that walked it statement by statement,
 * swallowing "already exists" so a device with no bookkeeping could catch up.
 * That destroys databases: replaying from 0000 re-creates
 * `exceptional_slots`, a table migration 33 renamed away, and thirty-three
 * files later the rename meets the real `exceptional_tasks` and the app dies
 * on a 500. One statement further, the copy-and-drop takes the rows with it.
 *
 * So the case that matters here is the phone Estevão was holding: a database
 * already at the current schema, with data in it, and no record of a single
 * migration. It has to come out unchanged.
 */
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { migrateDevice } from '../src/lib/isolated/device-migrations';
import type { Oo1Db } from '../src/lib/isolated/wasm-client';

const ROOT = join(import.meta.dirname, '..');
const BOOKKEEPING = '__ontoplano_device_migrations';

/** Every migration, keyed the way `import.meta.glob` keys them. */
const files: Record<string, string> = Object.fromEntries(
	readdirSync(join(ROOT, 'drizzle'))
		.filter((name) => name.endsWith('.sql'))
		.sort()
		.map((name) => [`/drizzle/${name}`, readFileSync(join(ROOT, 'drizzle', name), 'utf8')])
);

/**
 * better-sqlite3 wearing sqlite-wasm's face.
 *
 * The migrator speaks the oo1 API the phone gives it; this is the same handful
 * of methods over a file on disk, so the test drives the real code rather than
 * a paraphrase of it.
 */
function oo1(db: Database.Database): Oo1Db {
	return {
		prepare(sql: string) {
			const rows = db.prepare(sql).raw().all() as unknown[][];
			let at = -1;
			const stmt = {
				bind: () => stmt,
				step: () => ++at < rows.length,
				get: () => rows[at],
				reset: () => stmt,
				finalize: () => undefined
			};
			return stmt as unknown as ReturnType<Oo1Db['prepare']>;
		},
		exec(sql) {
			if (typeof sql === 'string') db.exec(sql);
			else db.prepare(sql.sql).run(...((sql.bind ?? []) as never[]));
		},
		selectValue: (sql: string) => Object.values(db.prepare(sql).get() as object)[0],
		changes: () => db.prepare('select changes() as n').get<{ n: number }>()!.n
	};
}

/** The in-memory database the migrator replays the history into. */
const scratch = () => oo1(new Database(':memory:'));

const work = mkdtempSync(join(tmpdir(), 'ontoplano-device-migrations-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let db: Database.Database;
let n = 0;

/** A database at the current schema, exactly as the migrator would leave it. */
function upToDate(): Database.Database {
	const fresh = new Database(join(work, `db-${++n}.sqlite`));
	migrateDevice(oo1(fresh), files, scratch);
	return fresh;
}

/** Every table and its columns — what a migration re-run would disturb. */
function shape(d: Database.Database): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const name of tableNames(d).filter((t) => t !== BOOKKEEPING))
		out[name] = (d.prepare(`pragma table_info("${name}")`).all() as { name: string }[])
			.map((row) => row.name)
			// Sorted: a column added by the repair lands at the end of the table
			// rather than where the history would have put it, and SQLite does
			// not care where a column sits.
			.sort();
	return out;
}

const tableNames = (d: Database.Database) =>
	(
		d
			.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
			.all() as { name: string }[]
	).map((row) => row.name);

beforeEach(() => {
	db = upToDate();
});

// Each case replays the real history — seventy-odd files — more than once.
describe('a device migrating itself', { timeout: 60_000 }, () => {
	test('an empty database comes out with the whole schema', () => {
		const names = tableNames(db);
		for (const expected of ['exceptional_tasks', 'todo_tasks', 'goals', 'ledgers', 'workouts'])
			expect(names).toContain(expected);

		// And nothing the history renamed away survives the trip.
		for (const gone of [
			'exceptional_slots',
			'weekly_slots',
			'planner_todos',
			'trainings',
			'places'
		])
			expect(names).not.toContain(gone);
	});

	test('running it twice changes nothing', () => {
		const before = tableNames(db).sort();
		migrateDevice(oo1(db), files, scratch);
		expect(tableNames(db).sort()).toEqual(before);
	});

	/**
	 * The 500 Estevão was looking at, in one test.
	 *
	 * A phone that opened the app before any of this bookkeeping existed has
	 * the tables and no record of them. It must work out where it stands
	 * without touching a row.
	 */
	test('a database with no record of its migrations keeps its data', () => {
		const untouched = upToDate();

		db.prepare('insert into user (id, name, email) values (?, ?, ?)').run(
			'isolated',
			'isolated',
			'isolated@localhost'
		);
		const category = db
			.prepare(
				"insert into categories (user_id, name, color) values ('isolated', 'Work', '#123456')"
			)
			.run().lastInsertRowid;
		db.prepare(
			'insert into exceptional_tasks (user_id, date, start_time, duration_minutes, mode, category_id, label) ' +
				`values ('isolated', '2026-01-01', '09:00', 60, 'category', ${category}, 'the one row that matters')`
		).run();
		db.exec(`drop table ${BOOKKEEPING}`);

		expect(() => migrateDevice(oo1(db), files, scratch)).not.toThrow();

		const row = db.prepare('select label from exceptional_tasks').get() as { label: string };
		expect(row.label).toBe('the one row that matters');
		expect(tableNames(db)).not.toContain('exceptional_slots');

		// And it worked that out by rolling every file back, not by running it:
		// a single applied migration here means something was rewritten.
		// And it worked that out without running a statement: the schema it came
		// out with is the schema it went in with, to the column. Migration 53
		// rebuilds `exceptional_tasks` from a copy, so re-running it here would
		// silently take every column added after it.
		expect(shape(db)).toEqual(shape(untouched));
	});

	/**
	 * The case the whole thing exists for.
	 *
	 * A phone that installed the app months ago holds the schema of that
	 * release and nothing else — the migrator before this one ran the history
	 * once, on an empty file, and never again. It has to be carried forward
	 * without losing what is in it.
	 */
	test('a device left behind at an older release is carried forward', () => {
		const old = new Database(join(work, `old-${++n}.sqlite`));
		old.exec('pragma foreign_keys = off');
		const upTo = Object.keys(files).sort().indexOf('/drizzle/0050_glorious_iceman.sql');
		expect(upTo).toBeGreaterThan(0);
		for (const path of Object.keys(files)
			.sort()
			.slice(0, upTo + 1))
			for (const statement of files[path].split('--> statement-breakpoint'))
				if (statement.trim()) old.exec(statement);

		old
			.prepare('insert into user (id, name, email) values (?, ?, ?)')
			.run('isolated', 'isolated', 'isolated@localhost');
		old
			.prepare(
				"insert into categories (user_id, name, color) values ('isolated', 'Work', '#123456')"
			)
			.run();

		migrateDevice(oo1(old), files, scratch);

		// It ends up where a database that had run everything would be...
		expect(shape(old)).toEqual(shape(upToDate()));
		// ...with what was in it still in it, and it knows where it stands.
		expect((old.prepare('select name from categories').get() as { name: string }).name).toBe(
			'Work'
		);
		expect(
			(
				old.prepare(`select count(*) as n from ${BOOKKEEPING} where state = 'applied'`).get() as {
					n: number;
				}
			).n
		).toBe(Object.keys(files).length);
	});

	/**
	 * The two phones Estevão was holding, recovered.
	 *
	 * 0.162.4 shipped a migrator that walked the history statement by statement
	 * and swallowed "already exists" as it went. On a device already at the
	 * current schema that gets as far as migration 33 — stamping thirty-two
	 * files as applied and rebuilding two tables at their old shapes on the way
	 * — and then dies on the rename, which is the 500 both apps showed. The
	 * state it leaves behind is what this rebuilds and then repairs.
	 */
	test('a device the previous migrator mangled comes back', () => {
		const alreadyDone = (e: unknown) => {
			const said = String((e as { message?: string })?.message ?? e).toLowerCase();
			return (
				said.includes('duplicate column') ||
				said.includes('already exists') ||
				said.includes('duplicate index')
			);
		};

		// The old migrator, exactly, against a database already up to date.
		db.exec(`drop table ${BOOKKEEPING}`);
		db.exec('pragma foreign_keys = off');
		db.exec(`create table ${BOOKKEEPING} (tag text primary key, applied_at text not null)`);
		let died = '';
		walk: for (const path of Object.keys(files).sort()) {
			for (const statement of files[path].split('--> statement-breakpoint')) {
				const sql = statement.trim();
				if (!sql) continue;
				try {
					db.exec(sql);
				} catch (e) {
					if (!alreadyDone(e)) {
						died = String(e);
						break walk;
					}
				}
			}
			db.prepare(`insert or replace into ${BOOKKEEPING} values (?, ?)`).run(
				path.replace(/^.*\//, '').replace(/\.sql$/, ''),
				'whenever'
			);
		}

		// This is the failure, verbatim off his screen.
		expect(died).toContain('there is already another table or index with this name');
		expect(died).toContain('exceptional_tasks');

		migrateDevice(oo1(db), files, scratch);

		expect(shape(db)).toEqual(shape(upToDate()));

		// Including `exceptional_tasks.training_id`, whose foreign key points at
		// a table migration 54 took away: left in place it fails every insert.
		db.prepare("insert into user (id, name, email) values ('u', 'u', 'u@localhost')").run();
		const category = db
			.prepare("insert into categories (user_id, name, color) values ('u', 'W', '#123456')")
			.run().lastInsertRowid;
		expect(() =>
			db
				.prepare(
					'insert into exceptional_tasks (user_id, date, start_time, mode, category_id) ' +
						`values ('u', '2026-01-01', '09:00', 'category', ${category})`
				)
				.run()
		).not.toThrow();

		// Nothing is left retrying on every launch either.
		expect(
			(
				db.prepare(`select count(*) as n from ${BOOKKEEPING} where state = 'skipped'`).get() as {
					n: number;
				}
			).n
		).toBe(0);
	});

	test('a half-finished copy from a migrator that died is cleared away', () => {
		db.exec('create table __new_exceptional_tasks (id integer primary key)');
		migrateDevice(oo1(db), files, scratch);
		expect(tableNames(db)).not.toContain('__new_exceptional_tasks');
	});

	test('a retired table recreated by an older build is cleared away', () => {
		db.exec('create table exceptional_slots (id integer primary key)');
		migrateDevice(oo1(db), files, scratch);
		expect(tableNames(db)).not.toContain('exceptional_slots');
	});

	test('a retired table that somehow holds rows is left alone', () => {
		db.exec('create table places (id integer primary key)');
		db.exec('insert into places (id) values (1)');
		migrateDevice(oo1(db), files, scratch);
		expect(tableNames(db)).toContain('places');
	});

	/** Better-auth's tables are made by migrations and declared elsewhere. */
	test('the sweep does not take tables the schema module does not declare', () => {
		expect(tableNames(db)).toContain('user');
		migrateDevice(oo1(db), files, scratch);
		expect(tableNames(db)).toContain('user');
	});
});
