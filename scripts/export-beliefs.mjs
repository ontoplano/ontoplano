/**
 * Export everything in the beliefs module to JSON, before the tables are dropped.
 *
 * The beliefs feature is being removed. Its content is personal reflection that
 * took real effort to write, so it gets exported rather than deleted outright.
 * Run this yourself, review the output, and only then apply the drop migration.
 *
 *   node scripts/export-beliefs.mjs [output.json]
 *
 * Reads only the beliefs-module tables. Nothing else is touched, and the
 * database is opened read-only.
 */
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dbPath =
	process.env.DATABASE_URL || join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');

const out =
	process.argv[2] ??
	join(homedir(), `ontoplano-beliefs-export-${new Date().toISOString().slice(0, 10)}.json`);

const TABLES = [
	'beliefs',
	'belief_relations',
	'evidence',
	'belief_evidence',
	'belief_intensities',
	'belief_habits',
	'belief_tags',
	'graph_views'
];

const db = new Database(dbPath, { readonly: true });

const present = new Set(
	db
		.prepare("SELECT name FROM sqlite_master WHERE type='table'")
		.all()
		.map((r) => r.name)
);

const payload = { exportedAt: new Date().toISOString(), source: dbPath, tables: {} };

for (const table of TABLES) {
	if (!present.has(table)) {
		console.log(`skip ${table} (not present)`);
		continue;
	}
	const rows = db.prepare(`SELECT * FROM ${table}`).all();
	payload.tables[table] = rows;
	console.log(`${table}: ${rows.length} rows`);
}

db.close();

writeFileSync(out, JSON.stringify(payload, null, 2), 'utf-8');
console.log(`\nWritten to ${out}`);
console.log('Review it before running `yarn db:migrate` to drop the tables.');
