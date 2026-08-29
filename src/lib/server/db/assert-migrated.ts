import type Database from 'better-sqlite3';
// Bundled at build time, so the code itself knows which migrations it expects —
// the check cannot be defeated by a deploy that forgot to ship the drizzle dir.
import journal from '../../../../drizzle/meta/_journal.json';

/**
 * Refuse to serve when the database is behind the code.
 *
 * A half-migrated instance fails in ways that look like bugs for weeks: a
 * column is missing on one query in twenty, and every symptom points somewhere
 * else. Failing at boot, loudly, with the command to run, turns that into a
 * ten-second fix.
 *
 * Two soft cases, deliberately:
 * - A database managed by `db:push` (dev, tests) has no migrations table at
 *   all. That is a workflow, not a fault — warn and serve.
 * - `ONTOPLANO_SKIP_MIGRATION_CHECK=true` is the escape hatch for someone who
 *   knows better, because a guard nobody can get past is an outage.
 */
export function assertMigrated(client: Database.Database, path: string): void {
	if (process.env.ONTOPLANO_SKIP_MIGRATION_CHECK === 'true') return;

	const entries = journal.entries;
	if (entries.length === 0) return;

	const anyTable = client
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'`)
		.get();
	const migrationsTable = client
		.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`
		)
		.get();

	if (!migrationsTable) {
		if (!anyTable) {
			throw new Error(
				`The database at ${path} is empty. Run \`yarn db:migrate\` before starting the app.`
			);
		}
		// Schema present but never migrated: a push-managed database.
		console.warn(
			JSON.stringify({
				at: new Date().toISOString(),
				level: 'warn',
				message: `Database at ${path} has no migration history (push-managed?); skipping the migration check.`
			})
		);
		return;
	}

	const applied = client
		.prepare(`SELECT max(created_at) AS latest FROM __drizzle_migrations`)
		.get() as { latest: number | string | null };

	// The newest timestamp is the whole comparison, because it is the one
	// drizzle's migrator itself makes: it applies every journal entry newer
	// than max(created_at) and nothing else. Counting rows is stricter than
	// the migrator — a database that started on `db:push` and was adopted into
	// migrations later has fewer rows than the journal forever, while being
	// exactly up to date.
	const newest = entries[entries.length - 1];

	if (Number(applied.latest ?? 0) < newest.when) {
		throw new Error(
			`The database at ${path} is behind the code (it expects up to ${newest.tag}). ` +
				`Run \`yarn db:migrate\`, or set ONTOPLANO_SKIP_MIGRATION_CHECK=true to serve anyway.`
		);
	}
}
