import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The migrations and the schema must build the same database.
 *
 * Every unit test runs against `drizzle-kit push`, which builds straight from
 * the schema file — but every real instance is built by the migrations, and
 * nothing compared the two. The gap this closes was live for months: four
 * foreign keys declared ON DELETE SET NULL had never had a migration carry
 * the action, so deleting a workout category worked in every test and failed
 * on every deployment, which is where the demo's sweep found it.
 *
 * Only the foreign keys are compared. Columns and indexes drift too, but
 * cosmetically — `DEFAULT false` against `DEFAULT 0` — and asserting on the
 * rendering would make this test about drizzle's printer instead of about
 * behaviour.
 */
describe('the migrations against the schema', () => {
	// Two whole databases get built; under a loaded suite that outgrows the
	// default five seconds.
	it('agree on every foreign key and its actions', { timeout: 60_000 }, () => {
		const dir = mkdtempSync(join(tmpdir(), 'onto-parity-'));
		try {
			const migrated = join(dir, 'migrated.db');
			const pushed = join(dir, 'pushed.db');
			execFileSync(process.execPath, ['scripts/migrate.mjs'], {
				env: { ...process.env, DATABASE_URL: migrated },
				stdio: 'pipe'
			});
			execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
				env: { ...process.env, DATABASE_URL: pushed },
				stdio: 'ignore'
			});
			expect(foreignKeys(migrated)).toEqual(foreignKeys(pushed));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

function foreignKeys(path: string): string[] {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const Database = require('better-sqlite3');
	const db = new Database(path);
	const tables = db
		.prepare(
			"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '\\_\\_drizzle%' escape '\\'"
		)
		.all()
		.map((r: { name: string }) => r.name);
	const out: string[] = [];
	for (const table of tables)
		for (const fk of db.prepare(`pragma foreign_key_list("${table}")`).all() as {
			from: string;
			table: string;
			to: string;
			on_delete: string;
			on_update: string;
		}[])
			out.push(
				`${table}.${fk.from} -> ${fk.table}.${fk.to} on delete ${fk.on_delete} on update ${fk.on_update}`
			);
	db.close();
	return out.sort();
}
