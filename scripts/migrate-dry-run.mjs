#!/usr/bin/env node
/**
 * Run the whole migration against a copy, and touch nothing.
 *
 * A deploy that jumps thirty releases applies thirty migrations to a database
 * full of somebody's real writing, and finding out whether that works by doing
 * it to production is not a plan. This copies the file, migrates the copy,
 * checks its foreign keys and throws it away — so the answer to "will this
 * deploy migrate cleanly" is known before the deploy, from the same migrator
 * the deploy will use.
 *
 *   node scripts/migrate-dry-run.mjs [path/to.db]
 *
 * The original is opened read-only and copied with SQLite's own backup, so a
 * live server can be checked while it is serving.
 */
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const from =
	process.argv[2] ||
	process.env.DATABASE_URL ||
	join(homedir(), '.local/share/ontoplano/ontoplano.db');

const size = statSync(from).size;
const room = mkdtempSync(join(tmpdir(), 'ontoplano-dry-run-'));
const copy = join(room, 'copy.db');

console.log(`\n  Dry run of the migration.\n`);
console.log(`  from  ${from}  (${(size / 1024 / 1024).toFixed(1)}MB)`);
console.log(`  onto  ${copy}\n`);

try {
	/*
	 * SQLite's own backup, not `cp`.
	 *
	 * A file being written to is not a file you can copy byte for byte — the
	 * copy lands mid-transaction and is corrupt, or is missing whatever is
	 * still in the write-ahead log. `VACUUM INTO` takes a consistent snapshot
	 * of a live database without stopping it.
	 */
	const live = new Database(from, { readonly: true, fileMustExist: true });
	live.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
	live.close();

	execFileSync('node', ['scripts/migrate.mjs'], {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: copy }
	});

	console.log('\n  The copy migrated cleanly. The real one is untouched.\n');
} catch {
	console.error(
		'\n  The migration FAILED on the copy, so it would fail on the real one.\n' +
			'  Nothing was touched. Read the error above before deploying.\n'
	);
	process.exitCode = 1;
} finally {
	rmSync(room, { recursive: true, force: true });
}
