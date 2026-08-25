/**
 * Refuse `db:push` against a database that looks like production.
 *
 * `drizzle-kit push` diffs the schema and applies the difference directly. To
 * change a column SQLite rebuilds the table, and push has produced a migration
 * that dropped data three times in this project's history. Production goes
 * through `db:generate` → read the SQL → `db:migrate`, which snapshots first.
 *
 * The escape hatch is deliberate and loud: ONTOPLANO_ALLOW_PUSH=true.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROD_DB = join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');
const target = process.env.DATABASE_URL || PROD_DB;

if (process.env.ONTOPLANO_ALLOW_PUSH === 'true') {
	console.warn(`db:push against ${target} — allowed by ONTOPLANO_ALLOW_PUSH.`);
	process.exit(0);
}

const isProdPath = target === PROD_DB;
const looksLive = isProdPath && existsSync(target);

if (looksLive || process.env.NODE_ENV === 'production') {
	console.error(
		[
			'',
			`Refusing to push the schema at ${target}.`,
			'',
			'push rebuilds tables to change them, and has dropped data here before.',
			'For a real database:',
			'',
			'  yarn db:generate     # write the migration',
			'  $EDITOR drizzle/…    # read it — generated SQL has been wrong',
			'  yarn db:migrate      # snapshots first, then applies',
			'',
			'For a scratch database, point DATABASE_URL at it:',
			'',
			'  DATABASE_URL=/tmp/scratch.db yarn db:push',
			''
		].join('\n')
	);
	process.exit(1);
}

console.log(`db:push → ${target}`);
