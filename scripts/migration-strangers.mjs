#!/usr/bin/env node
/**
 * Which migrations a database has actually applied, and which are strangers.
 *
 * `scripts/migrate.mjs` refuses a database holding a migration hash the repo
 * cannot produce, which is the right thing to do and a terrible thing to
 * debug: it says how many strangers there are and nothing about which. This
 * prints the whole list — every applied migration, named where the repo can
 * name it, with the moment it was applied — so the answer to "what did this
 * database run, and when" is one command rather than an afternoon.
 *
 *   node scripts/migration-strangers.mjs [path/to.db]
 *
 * Reads only. The database is opened read-only, so this is safe to point at a
 * server's live file.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const path =
	process.argv[2] ||
	process.env.DATABASE_URL ||
	join(homedir(), '.local/share/ontoplano/ontoplano.db');

const db = new Database(path, { readonly: true, fileMustExist: true });

const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8'));
const known = new Map(
	journal.entries.map((entry) => [
		createHash('sha256')
			.update(readFileSync(`./drizzle/${entry.tag}.sql`))
			.digest('hex'),
		entry.tag
	])
);

const table = db
	.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`)
	.get();
if (!table) {
	console.log(`${path}\n  no migrations table — nothing has ever been applied here`);
	process.exit(0);
}

const applied = db
	.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
	.all();

console.log(`${path}\n  ${applied.length} applied, ${known.size} in this build\n`);

const strangers = [];
for (const row of applied) {
	const tag = known.get(row.hash);
	const when = new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 19);
	if (tag) console.log(`  ${when}  ${tag}`);
	else {
		strangers.push(row);
		console.log(`  ${when}  STRANGER ${row.hash.slice(0, 16)}…`);
	}
}

// And what this build has that the database has not.
const missing = journal.entries.filter(
	(entry) =>
		!applied.some(
			(row) =>
				row.hash ===
				createHash('sha256')
					.update(readFileSync(`./drizzle/${entry.tag}.sql`))
					.digest('hex')
		)
);
if (missing.length > 0) console.log(`\n  not yet applied: ${missing.map((e) => e.tag).join(', ')}`);

if (strangers.length > 0) {
	console.log(
		`\n  ${strangers.length} stranger(s). The timestamp above says when this database ran it,\n` +
			'  which is usually enough to say which build it came from.'
	);
	process.exit(1);
}
