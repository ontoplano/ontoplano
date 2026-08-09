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
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { snapshot } from './db-snapshot.mjs';

const path =
	process.env.DATABASE_URL || join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');

const isNew = !existsSync(path);
if (!isNew) snapshot('pre-migrate');

const client = new Database(path);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

try {
	migrate(drizzle(client), { migrationsFolder: './drizzle' });
	console.log('Migrations applied.');
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
