/**
 * Reinterpret the instant columns as UTC.
 *
 * Every timestamp in this database was written in the server's local time with
 * no zone on it (finding S7). Now that instants are stored as UTC ISO-8601, the
 * old rows have to be read the way they were written — in one stated zone — and
 * rewritten as the moments they actually were.
 *
 * What it touches: columns that hold a *moment*. It deliberately leaves
 * `task_records.scheduled_at`, `recurring_tasks.start_time` and every civil date
 * alone — those are wall-clock values, and "gym at 18:00" does not move because
 * the reader did.
 *
 * Dry run unless you pass --apply, and it snapshots first when it writes.
 *
 *   node scripts/migrate-timestamps.mjs --from=America/Sao_Paulo
 *   node scripts/migrate-timestamps.mjs --from=America/Sao_Paulo --apply
 *
 * Idempotent: a value that already carries a zone is left as it is, so running
 * it twice cannot shift anything twice.
 */
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { snapshot } from './db-snapshot.mjs';

/** table → the columns that hold an instant. */
const INSTANT_COLUMNS = {
	activities: ['created_at', 'updated_at'],
	api_tokens: ['last_used_at', 'expires_at', 'revoked_at', 'created_at', 'updated_at'],
	daily_wins: ['created_at'],
	data_points: ['at', 'created_at'],
	data_streams: ['archived_at', 'created_at', 'updated_at'],
	diary_entries: ['created_at', 'updated_at'],
	exceptional_tasks: ['created_at', 'updated_at'],
	goal_areas: ['created_at'],
	goals: ['closed_at', 'created_at', 'updated_at'],
	habit_occurrences: ['created_at'],
	habits: ['created_at'],
	ideas: ['created_at', 'updated_at'],
	todo_tasks: ['created_at', 'updated_at'],
	planning_schemes: ['created_at', 'updated_at'],
	plugin_manifests: ['updated_at'],
	quotes: ['created_at'],
	shopping_categories: ['created_at'],
	shopping_items: ['bought_at', 'created_at', 'updated_at'],
	// `scheduled_at` is NOT here: it is a wall-clock value.
	task_records: ['completed_at', 'created_at'],
	recurring_tasks: ['created_at', 'updated_at']
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const from = (args.find((a) => a.startsWith('--from=')) ?? '').split('=')[1];
const path =
	(args.find((a) => a.startsWith('--db=')) ?? '').split('=')[1] ??
	process.env.DATABASE_URL ??
	join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');

if (!from) {
	console.error('Say which zone these timestamps were written in, e.g. --from=America/Sao_Paulo');
	process.exit(1);
}

try {
	new Intl.DateTimeFormat('en-US', { timeZone: from });
} catch {
	console.error(`Unknown timezone: ${from}`);
	process.exit(1);
}

function offsetAt(instant, tz) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		})
			.formatToParts(instant)
			.map((p) => [p.type, p.value])
	);
	const asUTC = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour) % 24,
		Number(parts.minute),
		Number(parts.second)
	);
	return asUTC - instant.getTime();
}

/**
 * The stored value as a UTC instant, or null when it should be left alone.
 *
 * Accepts both shapes the app has written: SQLite's `CURRENT_TIMESTAMP`
 * ("2026-08-24 21:39:00", which is already UTC) and the app's own local
 * `toLocalISOString` ("2026-08-24T21:39:00", which is not).
 */
function convert(value) {
	if (typeof value !== 'string' || value === '') return null;
	// Already carries a zone: converted on a previous run, or written by the
	// code that came after this migration.
	if (/[zZ]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) return null;

	// Two shapes, and they are NOT the same thing.
	//
	// "2026-03-30 14:10:07" — a space — came from the column default,
	// `CURRENT_TIMESTAMP`, which SQLite computes in UTC whatever the machine's
	// timezone is. It is already the right moment and only lacks the marker;
	// shifting it would move a correct value by three hours.
	//
	// "2026-03-30T14:10:07" — a T — came from the app's `toLocalISOString`,
	// which wrote the server's wall clock with no zone. That one is genuinely
	// local and gets converted.
	const fromDefault = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
	if (fromDefault) return { to: `${value.replace(' ', 'T')}.000Z`, kind: 'marked' };

	const fromApp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
	if (!fromApp) return null;

	const naive = new Date(`${value.length === 16 ? `${value}:00` : value}Z`);
	if (Number.isNaN(naive.getTime())) return null;

	let guess = naive.getTime() - offsetAt(naive, from);
	guess = naive.getTime() - offsetAt(new Date(guess), from);
	return { to: new Date(guess).toISOString(), kind: 'shifted' };
}

const db = new Database(path);
const tables = new Set(
	db
		.prepare("select name from sqlite_master where type = 'table'")
		.all()
		.map((r) => r.name)
);

let planned = 0;
const counts = { marked: 0, shifted: 0 };
const examples = { marked: [], shifted: [] };

const work = [];
for (const [table, columns] of Object.entries(INSTANT_COLUMNS)) {
	if (!tables.has(table)) continue;
	const present = new Set(
		db
			.prepare(`select name from pragma_table_info('${table}')`)
			.all()
			.map((r) => r.name)
	);

	for (const column of columns) {
		if (!present.has(column)) continue;
		const rows = db
			.prepare(
				`select rowid as rid, "${column}" as value from "${table}" where "${column}" is not null`
			)
			.all();

		for (const row of rows) {
			const next = convert(row.value);
			if (!next || next.to === row.value) continue;
			work.push({ table, column, rid: row.rid, from: row.value, to: next.to, kind: next.kind });
			planned++;
			counts[next.kind]++;
			if (examples[next.kind].length < 3)
				examples[next.kind].push(`    ${table}.${column}: ${row.value} → ${next.to}`);
		}
	}
}

const offsetMinutes = Math.round(-offsetAt(new Date(), from) / 60_000);
const offsetHours = offsetMinutes / 60;
const sign = offsetHours >= 0 ? '+' : '';

console.log(`Database: ${path}`);
console.log(`Values to rewrite: ${planned}\n`);

console.log(`  Already UTC, marker added: ${counts.marked}`);
console.log('  These came from the column default. SQLite computes');
console.log('  CURRENT_TIMESTAMP in UTC whatever the machine is set to, so the');
console.log('  moment is already right and shifting it would break it.');
if (examples.marked.length) console.log(examples.marked.join('\n'));

console.log(`\n  Local ${from}, converted to UTC (${sign}${offsetHours}h): ${counts.shifted}`);
console.log("  These came from the app's own timestamp, which wrote the server's");
console.log('  wall clock with no zone on it. This is the half that moves.');
if (examples.shifted.length) console.log(examples.shifted.join('\n'));
else console.log('    (none in this database)');

if (!apply) {
	console.log('\nDry run. Nothing was written. Add --apply when the sample above looks right.');
	db.close();
	process.exit(0);
}

if (planned === 0) {
	console.log('\nNothing to do.');
	db.close();
	process.exit(0);
}

db.close();
const copy = snapshot('pre-timestamps');
console.log(`\nSnapshot: ${copy}`);

const write = new Database(path);
const update = new Map();
const tx = write.transaction((items) => {
	for (const item of items) {
		const key = `${item.table}.${item.column}`;
		if (!update.has(key))
			update.set(
				key,
				write.prepare(`update "${item.table}" set "${item.column}" = ? where rowid = ?`)
			);
		update.get(key).run(item.to, item.rid);
	}
});
tx(work);
write.close();

console.log(`Rewrote ${planned} values.`);
