/**
 * The migrator the isolated instance runs on the device.
 *
 * Its own module rather than part of the worker so it can be tested against a
 * real SQLite file in Node. The failure it exists to prevent cost two phones
 * their app, and reading the code was not enough to see it coming — see
 * `migrateDevice`.
 */
import * as schema from '$lib/db/schema.js';
import { getTableName, is, Table } from 'drizzle-orm';
import type { Oo1Db } from './wasm-client.js';

/**
 * Which migrations this device has run.
 *
 * Its own table rather than drizzle's: drizzle records a hash of each file and
 * this replays by name, because a device upgrading from before any of this was
 * recorded has to be able to re-run what it already has without being refused.
 *
 * `state` is `applied` or `skipped`.
 */
const MIGRATIONS_TABLE = '__ontoplano_device_migrations';

/** Tables drizzle builds mid-migration and renames over the original. */
const HALFWAY_TABLE_PREFIX = '__new_';

/** The savepoint each migration runs inside. */
const SAVEPOINT = 'ontoplano_migration';

/** `/drizzle/0053_dusty_toad.sql` → `0053_dusty_toad`, the name written down. */
const tagOf = (path: string) => path.replace(/^.*\//, '').replace(/\.sql$/, '');

/** Every table this build's schema knows the name of. */
function tablesThisBuildKnows(): Set<string> {
	const names = new Set<string>();
	for (const exported of Object.values(schema))
		if (is(exported, Table)) names.add(getTableName(exported));
	return names;
}

/**
 * Table names the history renamed away, and nothing has used since.
 *
 * Read out of the migrations rather than listed by hand, so it stays true as
 * more of them are written. A table is retired if some migration renames it
 * away (`ALTER TABLE a RENAME TO b`) or drops it outright — `trainings` and
 * `places` went the second way — and the current schema has nothing by that
 * name. That last condition is what keeps drizzle's copy-and-drop-and-rename
 * out of it: those retire nothing, they rebuild a table under its own name.
 */
function retiredTableNames(files: Record<string, string>): Set<string> {
	const known = tablesThisBuildKnows();
	const retired = new Set<string>();
	const gone = [
		/alter\s+table\s+[`"']?([A-Za-z0-9_]+)[`"']?\s+rename\s+to\b/gi,
		/drop\s+table\s+(?:if\s+exists\s+)?[`"']?([A-Za-z0-9_]+)[`"']?/gi
	];
	for (const sql of Object.values(files))
		for (const pattern of gone)
			for (const [, name] of sql.matchAll(pattern))
				if (!known.has(name) && !name.startsWith(HALFWAY_TABLE_PREFIX)) retired.add(name);
	return retired;
}

/**
 * Tables no build has a use for any more.
 *
 * Two kinds, and only these two: drizzle's half-finished `__new_*` copies,
 * which survive only a migrator that died mid-file, and tables an old release
 * renamed away — which an earlier version of this migrator recreated, empty,
 * on every device it touched, where they then collide with the very rename
 * that retired them.
 *
 * Deliberately not "everything the schema does not mention": better-auth's
 * tables are created by migrations and declared elsewhere, and a tidy-up broad
 * enough to catch debris is broad enough to take those with it. A retired
 * table that somehow still holds rows is left alone and said out loud.
 */
function sweepDebris(db: Oo1Db, files: Record<string, string>): void {
	const retired = retiredTableNames(files);
	const present: string[] = [];
	{
		const rows = db.prepare(
			"select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
		);
		while (rows.step()) present.push(String((rows.get([]) as unknown[])[0]));
		// An open statement holds a read lock and the DDL below would be refused.
		rows.finalize();
	}

	for (const name of present) {
		if (!name.startsWith(HALFWAY_TABLE_PREFIX) && !retired.has(name)) continue;
		const rows = db.selectValue(`select count(*) from "${name}"`) as number;
		if (rows > 0) {
			console.warn(`[isolated] keeping retired table ${name}: it holds ${rows} row(s)`);
			continue;
		}
		db.exec(`drop table "${name}"`);
	}
}

/** Every column of every table, as one comparable line per table. */
function columnsByTable(db: Oo1Db): Map<string, Set<string>> {
	const names: string[] = [];
	{
		const rows = db.prepare(
			"select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
		);
		while (rows.step()) names.push(String((rows.get([]) as unknown[])[0]));
		rows.finalize();
	}

	const schemaOf = new Map<string, Set<string>>();
	for (const table of names) {
		if (table === MIGRATIONS_TABLE || table.startsWith(HALFWAY_TABLE_PREFIX)) continue;
		const columns = new Set<string>();
		const rows = db.prepare(`pragma table_info("${table}")`);
		while (rows.step()) columns.add(String((rows.get([]) as unknown[])[1]));
		rows.finalize();
		schemaOf.set(table, columns);
	}
	return schemaOf;
}

/** Whether `wanted` is entirely contained in `has`. */
function contains(has: Map<string, Set<string>>, wanted: Map<string, Set<string>>): boolean {
	for (const [table, columns] of wanted) {
		const mine = has.get(table);
		if (!mine) return false;
		for (const column of columns) if (!mine.has(column)) return false;
	}
	return true;
}

/**
 * How far along the history a database with no bookkeeping already is.
 *
 * Every device in this position was set up by the migrator that ran the whole
 * of `drizzle/` once, when the file was empty, and then never again — so its
 * schema is exactly some past release's, not a mixture. Which one is worth
 * knowing precisely, because guessing costs data: migration 53 rebuilds
 * `exceptional_tasks` from scratch, and running it again on a modern device
 * quietly drops every column added since.
 *
 * So the history is replayed into a database in memory, one file at a time,
 * and the device is matched against the shape after each. The answer is the
 * index of the last migration it already holds; everything after that is real
 * work and runs for real. `-1` means it stands before the first one.
 */
function positionInHistory(
	device: Map<string, Set<string>>,
	paths: string[],
	files: Record<string, string>,
	scratch: Oo1Db
): number {
	scratch.exec('pragma foreign_keys = off');
	let furthest = -1;
	for (let i = 0; i < paths.length; i++) {
		for (const statement of files[paths[i]].split('--> statement-breakpoint')) {
			const sql = statement.trim();
			if (sql) scratch.exec(sql);
		}
		if (contains(device, columnsByTable(scratch))) furthest = i;
	}
	return furthest;
}

/** The whole history, run into an empty database: what the schema should be. */
function replayAll(db: Oo1Db, paths: string[], files: Record<string, string>): Oo1Db {
	db.exec('pragma foreign_keys = off');
	for (const path of paths)
		for (const statement of files[path].split('--> statement-breakpoint')) {
			const sql = statement.trim();
			if (sql) db.exec(sql);
		}
	return db;
}

/**
 * Make the device's schema match, by adding and only ever by adding.
 *
 * A migration is all-or-nothing here, which is what keeps a half-applied one
 * from existing — but it also means a file that is nine-tenths already present
 * rolls back the tenth along with the rest. That is fine for a device sitting
 * cleanly at some past release and not fine for one an earlier build mangled:
 * migration 54 both creates `workouts` and puts `workout_id` on two other
 * tables, and on a device that already has `workouts` the column never
 * arrives.
 *
 * So the last word belongs to a comparison rather than a replay. Whatever the
 * finished history produces is the answer, and the device is made to match it:
 * missing tables created, missing columns added, and columns the schema has
 * since replaced taken away.
 *
 * That last one is the only subtraction anywhere in this file and it is not
 * optional. `exceptional_tasks.training_id` became `workout_id` in migration
 * 54; a device still carrying the old one carries its foreign key to
 * `trainings` with it, and every insert into the table fails with "no such
 * table: trainings" once that table is gone. The column is unreadable by this
 * build either way — nothing in the schema names it — so the choice is between
 * losing a column no query mentions and losing the ability to write the row.
 */
function reconcile(db: Oo1Db, canonical: Oo1Db): void {
	const target = columnsByTable(canonical);
	const here = columnsByTable(db);

	for (const [table, columns] of target) {
		if (!here.has(table)) {
			const sql = canonical.selectValue(
				`select sql from sqlite_master where type = 'table' and name = '${table}'`
			) as string | null;
			if (!sql) continue;
			db.exec(sql);
			console.warn(`[isolated] rebuilt missing table ${table}`);
			continue;
		}

		const mine = here.get(table)!;
		const superseded = [...mine].filter((column) => !columns.has(column));
		if (superseded.length > 0) {
			rebuildTable(
				db,
				canonical,
				table,
				[...mine].filter((column) => columns.has(column))
			);
			console.warn(`[isolated] rebuilt ${table} without ${superseded.join(', ')}`);
			continue;
		}

		for (const column of columns) {
			if (mine.has(column)) continue;
			const spec = columnSpec(canonical, table, column);
			if (!spec) continue;
			db.exec(`alter table "${table}" add column ${spec}`);
			console.warn(`[isolated] added missing column ${table}.${column}`);
		}
	}

	// Indexes the rebuilt tables need. `if not exists` is not in the recorded
	// SQL, so the ones already here are stepped over rather than repaired.
	const existing = new Set<string>();
	{
		const rows = db.prepare("select name from sqlite_master where type = 'index'");
		while (rows.step()) existing.add(String((rows.get([]) as unknown[])[0]));
		rows.finalize();
	}
	const wanted: [string, string][] = [];
	{
		const rows = canonical.prepare(
			"select name, sql from sqlite_master where type = 'index' and sql is not null"
		);
		while (rows.step()) {
			const row = rows.get([]) as unknown[];
			wanted.push([String(row[0]), String(row[1])]);
		}
		rows.finalize();
	}
	for (const [name, sql] of wanted) if (!existing.has(name)) db.exec(sql);
}

/**
 * A table put back the way this build declares it, carrying its rows across.
 *
 * `ALTER TABLE ... DROP COLUMN` cannot help here: SQLite refuses to drop a
 * column that a table-level `FOREIGN KEY (...)` clause names, which is exactly
 * the shape drizzle writes, so `training_id` and its dead reference to
 * `trainings` cannot be picked out of the table one at a time.
 *
 * So it is drizzle's own copy-and-swap, in drizzle's own order, done against
 * the finished schema instead of a migration: build the replacement beside it
 * under a `__new_` name, copy every column the two have in common, drop the
 * original, rename over it. Every migration in `drizzle/` that changes a
 * column does exactly this, and for the same reason — the declaration names
 * itself, in `CONSTRAINT ... CHECK("exceptional_tasks"."mode" != …)`, so both
 * the table and every mention of it move together and SQLite writes the real
 * name back in as it renames.
 */
function rebuildTable(db: Oo1Db, canonical: Oo1Db, table: string, shared: string[]): void {
	const declaration = canonical.selectValue(
		`select sql from sqlite_master where type = 'table' and name = '${table}'`
	) as string | null;
	if (!declaration) return;

	const beside = `${HALFWAY_TABLE_PREFIX}${table}`;
	const named = declaration
		.replaceAll(`\`${table}\``, `\`${beside}\``)
		.replaceAll(`"${table}"`, `"${beside}"`);
	if (!named.includes(beside)) return;

	const list = shared.map((column) => `"${column}"`).join(', ');
	db.exec(named);
	if (shared.length > 0)
		db.exec(`insert into "${beside}" (${list}) select ${list} from "${table}"`);
	db.exec(`drop table "${table}"`);
	db.exec(`alter table "${beside}" rename to "${table}"`);
}

/**
 * One column, written the way `ALTER TABLE ... ADD COLUMN` will accept it.
 *
 * SQLite refuses to add a NOT NULL column with no default to a table that
 * already has rows, and there is no honest value to invent for one — so it
 * goes on nullable. The column exists, every query finds it, and the
 * constraint is the one thing that does not survive the repair.
 */
function columnSpec(canonical: Oo1Db, table: string, column: string): string | null {
	const rows = canonical.prepare(`pragma table_info("${table}")`);
	let spec: string | null = null;
	while (rows.step()) {
		const row = rows.get([]) as unknown[];
		if (String(row[1]) !== column) continue;
		const type = String(row[2] ?? '');
		const notNull = Number(row[3]) === 1;
		const fallback = row[4] === null || row[4] === undefined ? null : String(row[4]);
		spec = `"${column}" ${type}`;
		if (fallback !== null) spec += ` default ${fallback}`;
		if (notNull && fallback !== null) spec += ' not null';
	}
	rows.finalize();
	return spec;
}

/**
 * Bring this device's database up to the schema this build expects.
 *
 * A phone-only instance has nobody to run a migration for it, so it runs its
 * own — the app's real `drizzle/*.sql`, in order, split on the marker drizzle
 * writes between statements. What makes it harder than the server's is that a
 * device set up before any of this bookkeeping existed holds the tables and no
 * record of them: the old migrator ran the whole history once, when the file
 * was empty, and never again. Such a device is asked where it stands
 * (`positionInHistory`) and everything up to there is written down as already
 * done, untouched.
 *
 * Working it out that way rather than by trying each file is the whole point.
 * The version before this one replayed from the beginning and swallowed
 * "already exists" as it went, which succeeds at `CREATE TABLE
 * exceptional_slots` — migration 33 renamed that table away, so on a modern
 * device the name is free — and then dies thirty-three files later when the
 * rename meets the real `exceptional_tasks`. That is the 500 the app showed.
 * Worse, migration 53 rebuilds the same table from a copy, and re-running it
 * on a current database takes every column added since with it.
 *
 * What is genuinely pending then runs for real, each file inside a
 * **savepoint** so it is all-or-nothing. One that fails is written down as
 * `skipped` rather than throwing — a phone that cannot open its own database
 * shows nothing at all — and retried on the next launch, which costs one
 * failing statement and recovers a device whose debris has since been swept.
 */
export function migrateDevice(
	db: Oo1Db,
	files: Record<string, string>,
	scratch?: () => Oo1Db
): void {
	/*
	 * Foreign keys stay off for the duration, exactly as `scripts/migrate.mjs`
	 * does it on the server. SQLite cannot alter a table in place, so a column
	 * change is really "build the new table, copy, drop the old, rename", and
	 * dropping the old table trips every child row that points at it. The
	 * generated files carry a `PRAGMA foreign_keys=OFF` of their own, but that
	 * is a no-op inside a transaction and each file runs in a savepoint — so it
	 * has to be set here, on the connection, before anything starts.
	 */
	db.exec('pragma foreign_keys = off');

	const paths = Object.keys(files).sort();

	/*
	 * Whether this database's own record of what it has run can be believed.
	 *
	 * The first version of this migrator wrote a two-column table and filled it
	 * by replaying the history statement by statement, which stamped as
	 * "applied" thirty-odd migrations it had in fact only half-run before dying
	 * on migration 33. Every device it touched carries that. The missing
	 * `state` column is the marker, so those records are thrown away and the
	 * database is placed against the history from scratch instead.
	 */
	const believable =
		(db.selectValue(
			`select count(*) from pragma_table_info('${MIGRATIONS_TABLE}') where name = 'state'`
		) as number) > 0;

	db.exec(
		`create table if not exists ${MIGRATIONS_TABLE} (
			tag text primary key,
			applied_at text not null,
			state text not null default 'applied'
		)`
	);
	if (!believable) {
		try {
			db.exec(`alter table ${MIGRATIONS_TABLE} add column state text not null default 'applied'`);
			db.exec(`delete from ${MIGRATIONS_TABLE}`);
		} catch {
			/* the table was created just now, with the column and no rows */
		}
	}

	// Stepped rather than `selectValue`, which answers with a single cell.
	const done = new Set<string>();
	{
		const rows = db.prepare(`select tag from ${MIGRATIONS_TABLE} where state = 'applied'`);
		while (rows.step()) done.add(String((rows.get([]) as unknown[])[0]));
		rows.finalize();
	}

	/*
	 * An unbookkept database that already holds tables is placed against the
	 * history before a single statement runs. A brand new one is placed at -1
	 * without the work, and one that has been here before is placed by its own
	 * records.
	 */
	let canonical: Oo1Db | null = null;
	if (!believable && scratch) {
		const device = columnsByTable(db);
		if (device.size > 0) {
			// The probe comes out of this holding the whole history, which is
			// exactly what `reconcile` needs afterwards.
			canonical = scratch();
			const stands = positionInHistory(device, paths, files, canonical);
			const now = new Date().toISOString();
			for (const path of paths.slice(0, stands + 1)) {
				const tag = tagOf(path);
				done.add(tag);
				db.exec({
					sql: `insert or replace into ${MIGRATIONS_TABLE} (tag, applied_at, state) values (?, ?, 'applied')`,
					bind: [tag, now]
				});
			}
			console.info(
				`[isolated] this database already stood at ${stands < 0 ? 'nothing' : tagOf(paths[stands])}`
			);
		}
	}

	const applied: string[] = [];
	const skipped: string[] = [];

	for (const path of paths) {
		const tag = tagOf(path);
		if (done.has(tag)) continue;

		db.exec(`savepoint ${SAVEPOINT}`);
		let failure: string | null = null;
		try {
			for (const statement of files[path].split('--> statement-breakpoint')) {
				const sql = statement.trim();
				if (sql) db.exec(sql);
			}
		} catch (e) {
			failure = String((e as { message?: string })?.message ?? e);
		}
		if (failure === null) db.exec(`release ${SAVEPOINT}`);
		else db.exec(`rollback to ${SAVEPOINT}; release ${SAVEPOINT}`);

		if (failure === null) applied.push(tag);
		else {
			skipped.push(tag);
			console.warn(`[isolated] ${tag} did not apply and will be retried: ${failure}`);
		}
		db.exec({
			sql: `insert or replace into ${MIGRATIONS_TABLE} (tag, applied_at, state) values (?, ?, ?)`,
			bind: [tag, new Date().toISOString(), failure === null ? 'applied' : 'skipped']
		});
	}

	/*
	 * Anything the all-or-nothing pass could not deliver is settled by
	 * comparison. Only reached when something was rolled back or when the
	 * database had to be placed against the history: a database that simply ran
	 * its migrations — a brand new one included — has the schema its migrations
	 * produce, by construction, and pays nothing for this.
	 */
	if (scratch && (skipped.length > 0 || canonical !== null)) {
		canonical ??= replayAll(scratch(), paths, files);
		reconcile(db, canonical);

		/*
		 * And if the schema is now everything it should be, the files that
		 * rolled back have nothing left to deliver. Marking them settles them:
		 * without this a mangled device retries fifty-odd migrations on every
		 * launch, for ever, and none of them can ever succeed.
		 */
		if (contains(columnsByTable(db), columnsByTable(canonical)))
			db.exec(`update ${MIGRATIONS_TABLE} set state = 'applied' where state = 'skipped'`);
	}

	sweepDebris(db, files);

	// The same promise the server makes: a row cannot point at nothing.
	db.exec('pragma foreign_keys = on');

	if (applied.length > 0) console.info(`[isolated] applied ${applied.length} migration(s)`);
	if (skipped.length > 0)
		console.info(`[isolated] ${skipped.length} migration(s) were already in this database`);
}
