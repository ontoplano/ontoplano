/**
 * Consistent database snapshot, taken before every migration.
 *
 * Uses `VACUUM INTO` rather than copying the file: with WAL enabled, the .db
 * file alone is not a complete picture, and a plain `cp` can capture a torn
 * state. This produces a single self-contained, fully checkpointed copy.
 */
import Database from 'better-sqlite3';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const KEEP = 10;

function dbPath() {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	return join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');
}

export function snapshot(label = 'pre-migrate') {
	const path = dbPath();
	if (!existsSync(path)) {
		console.log(`No database at ${path} yet — nothing to snapshot.`);
		return null;
	}

	// Milliseconds, not seconds. `VACUUM INTO` refuses to overwrite, so two
	// snapshots in the same second used to fail the whole command with
	// "output file already exists" — which, now that `make dev` migrates
	// before it starts, is two `make dev` in a row.
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
	let out = `${path}.${label}-${stamp}`;
	for (let n = 2; existsSync(out); n++) out = `${path}.${label}-${stamp}-${n}`;

	const db = new Database(path, { readonly: true });
	try {
		db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
	} finally {
		db.close();
	}

	// Keep the most recent KEEP snapshots so this doesn't quietly fill the disk.
	const dir = dirname(path);
	const prefix = `${path.split('/').pop()}.${label}-`;
	const old = readdirSync(dir)
		.filter((f) => f.startsWith(prefix))
		.map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
		.sort((a, b) => b.t - a.t)
		.slice(KEEP);
	for (const { f } of old) unlinkSync(join(dir, f));

	console.log(`Snapshot: ${out}`);
	return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	snapshot(process.argv[2] ?? 'manual');
}
