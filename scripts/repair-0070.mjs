#!/usr/bin/env node
/**
 * One database, one wrong row: the pre-edit form of 0070.
 *
 * Two machines recorded `0070_stiff_giant_man` under the sha256 of that file
 * as drizzle-kit first wrote it — a bare `ALTER TABLE … ADD whole …` — rather
 * than the committed version, which also carries a backfill. That version was
 * never pushed and exists at no commit, so how it got there is unexplained;
 * what it means is not. The column was added. The backfill was not.
 *
 * So this does two things, and refuses if it does not find exactly what it
 * expects:
 *
 *   1. runs the backfill that never ran, so a goal measured in kilometres is
 *      not left marked as one you count;
 *   2. re-stamps the row to the committed file's hash, so the migrator stops
 *      calling it a stranger and can carry on with 0071.
 *
 * Idempotent, and it takes a snapshot first. Delete this file once both
 * databases have been through it.
 *
 *   node scripts/repair-0070.mjs [path/to.db]
 */
import Database from 'better-sqlite3';
import { copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** What drizzle-kit first wrote, and what is committed. */
const BEFORE = 'ea4cd91b4576746058a756daa140d345b6a82e5d2b27124f0c4ab7d3487fb3cb';
const AFTER = '0d524ca7572dbe4934c0bf3ff070718028f2cca563e4bcf4c928422d826b1180';

const path =
	process.argv[2] ||
	process.env.DATABASE_URL ||
	join(homedir(), '.local/share/ontoplano/ontoplano.db');

const db = new Database(path, { fileMustExist: true });

const stranger = db
	.prepare('SELECT count(*) AS n FROM __drizzle_migrations WHERE hash = ?')
	.get(BEFORE).n;

if (stranger === 0) {
	const already = db
		.prepare('SELECT count(*) AS n FROM __drizzle_migrations WHERE hash = ?')
		.get(AFTER).n;
	console.log(
		already > 0
			? `\n  ${path}\n  Already repaired — 0070 is recorded under the committed hash.\n`
			: `\n  ${path}\n  This database has neither version of 0070. Nothing to repair.\n`
	);
	process.exit(0);
}

// The column has to be there, or this is not the situation described above.
const columns = db
	.prepare('PRAGMA table_info(goal_targets)')
	.all()
	.map((c) => c.name);
if (!columns.includes('whole')) {
	console.error(
		`\n  ${path}\n  Refusing: goal_targets has no 'whole' column, so the migration this\n` +
			'  repairs did not actually run here. Something else is going on.\n'
	);
	process.exit(1);
}

const snapshot = `${path}.pre-repair-${new Date().toISOString().replace(/[:.]/g, '-')}`;
copyFileSync(path, snapshot);
console.log(`\n  ${path}\n  Snapshot: ${snapshot}\n`);

const repair = db.transaction(() => {
	/*
	 * The backfill, exactly as the committed migration carries it.
	 *
	 * Whole numbers on both sides is the test — the same one somebody would
	 * apply by eye. A goal standing at 14.6 of 21.1 kilometres was never a
	 * thing anybody counts.
	 */
	const changed = db
		.prepare(
			`UPDATE goal_targets SET whole = 0
			 WHERE target_value <> CAST(target_value AS INTEGER)
			    OR current_value <> CAST(current_value AS INTEGER)`
		)
		.run().changes;

	db.prepare('UPDATE __drizzle_migrations SET hash = ? WHERE hash = ?').run(AFTER, BEFORE);
	return changed;
});

const changed = repair();
console.log(
	`  Backfilled ${changed} measure(s) as fractional.\n` +
		'  Re-stamped 0070 to the committed hash.\n\n' +
		'  Now run the migration as usual:  make db-migrate\n'
);
