/**
 * Apply pending migrations, with a snapshot first and errors you can actually read.
 *
 * `drizzle-kit migrate` renders a spinner that overwrites its own error output,
 * so a failure surfaces as a bare "exit code 1" with no explanation. This runs
 * the same migrations through drizzle-orm's migrator and prints what went wrong.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { snapshot } from './db-snapshot.mjs';

const path =
	process.env.DATABASE_URL ||
	join(
		// The same override the server honours, so a packaged instance migrates
		// the database it is actually going to open rather than one under the
		// service account's home.
		process.env.ONTOPLANO_DATA_DIR || join(homedir(), '.local', 'share', 'ontoplano'),
		'ontoplano.db'
	);

const isNew = !existsSync(path);
if (!isNew) snapshot('pre-migrate');

// A fresh machine has no ~/.local/share/ontoplano yet, and better-sqlite3
// refuses to create a database inside a directory that does not exist — so
// the very first `make dev` died here before this line made the directory.
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma('journal_mode = WAL');

/*
 * Foreign keys stay off for the duration of the migration.
 *
 * SQLite cannot alter a table in place, so a column change is really "build the
 * new table, copy, drop the old, rename". With enforcement on, dropping the old
 * table trips every child row that still points at it. The generated migrations
 * carry a `PRAGMA foreign_keys=OFF` of their own, but that is a no-op inside a
 * transaction and drizzle runs the whole migration in one — so it has to be set
 * here, on the connection, before anything starts.
 *
 * The integrity check afterwards is what makes this safe rather than merely
 * quiet: it fails loudly if a migration left a dangling reference behind.
 */
client.pragma('foreign_keys = OFF');

/** How many are already in, so the run can say what it actually did. */
function appliedCount() {
	const table = client
		.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`
		)
		.get();
	if (!table) return 0;
	return client.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get().n;
}

const before = appliedCount();

/*
 * Refuse a database that ran migrations this code has never heard of.
 *
 * Drizzle records each applied migration as the sha256 of its file. If the
 * database holds a hash the repo does not — a feature branch's migration that
 * was renamed or renumbered before merging, a rolled-back release — then the
 * migrator would happily re-run DDL against tables that already exist and die
 * halfway through a CREATE. Caught here instead, BEFORE anything runs, with
 * the situation named: nothing is touched, and the fix is a decision rather
 * than an autopsy.
 */
if (before > 0) {
	const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8'));
	const known = new Set(
		journal.entries.map((entry) =>
			createHash('sha256')
				.update(readFileSync(`./drizzle/${entry.tag}.sql`))
				.digest('hex')
		)
	);
	const strangers = client
		.prepare('SELECT hash FROM __drizzle_migrations')
		.all()
		.filter((row) => !known.has(row.hash));
	if (strangers.length > 0) {
		console.error(
			`\nThis database has applied ${strangers.length} migration(s) this build has never heard of.\n\n` +
				'That usually means it ran a migration that was later renamed or renumbered —\n' +
				'a feature branch tried out before its migrations were re-stacked, or a\n' +
				'rollback to an older release. Running the migrator now would re-create\n' +
				'tables that already exist, so nothing has been touched.\n\n' +
				'On a dev machine: make reset-dev  (fresh database, dev account, seed).\n' +
				'On a server: stop — restore the pre-migrate snapshot beside the database\n' +
				'and work out which build this database belongs to before going further.'
		);
		process.exit(1);
	}
}

try {
	migrate(drizzle(client), { migrationsFolder: './drizzle' });

	const violations = client.pragma('foreign_key_check');
	if (violations.length > 0) {
		console.error('\nMigrations applied but left broken references:\n');
		for (const v of violations.slice(0, 20)) {
			console.error(`  ${v.table} row ${v.rowid} -> ${v.parent} (fk ${v.fkid})`);
		}
		if (violations.length > 20) console.error(`  ... and ${violations.length - 20} more`);
		console.error('\nRestore the snapshot printed above.');
		process.exitCode = 1;
	} else {
		// Said in numbers, because "Migrations applied." reads the same whether
		// it applied eleven or none — and `make dev` runs this every time.
		const applied = appliedCount() - before;
		console.log(
			applied === 0
				? 'Database already up to date.'
				: `${applied} migration${applied === 1 ? '' : 's'} applied.`
		);
	}
} catch (e) {
	console.error('\nMigration failed:\n');
	console.error(e instanceof Error ? (e.stack ?? e.message) : e);
	console.error(
		'\nThe database is unchanged apart from any migration that completed before' +
			'\nthe failure. Restore the snapshot printed above if you need to roll back.'
	);
	process.exitCode = 1;
} finally {
	client.close();
}
