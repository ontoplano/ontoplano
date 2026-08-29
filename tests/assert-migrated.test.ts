import { describe, it, expect, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { assertMigrated } from '../src/lib/server/db/assert-migrated';
import journal from '../drizzle/meta/_journal.json';

function withMigrationsTable(db: Database.Database, upTo: number) {
	db.exec(
		`CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)`
	);
	const insert = db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`);
	for (const entry of journal.entries.slice(0, upTo)) {
		insert.run(entry.tag, entry.when);
	}
}

describe('assertMigrated', () => {
	afterEach(() => {
		delete process.env.ONTOPLANO_SKIP_MIGRATION_CHECK;
		vi.restoreAllMocks();
	});

	it('refuses an empty database', () => {
		const db = new Database(':memory:');
		expect(() => assertMigrated(db, ':memory:')).toThrow(/empty/);
	});

	it('warns but serves a push-managed database', () => {
		const db = new Database(':memory:');
		db.exec(`CREATE TABLE user (id text PRIMARY KEY)`);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(() => assertMigrated(db, ':memory:')).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});

	it('refuses a database behind the code', () => {
		const db = new Database(':memory:');
		db.exec(`CREATE TABLE user (id text PRIMARY KEY)`);
		withMigrationsTable(db, journal.entries.length - 1);
		expect(() => assertMigrated(db, ':memory:')).toThrow(/behind the code/);
	});

	it('accepts a fully migrated database', () => {
		const db = new Database(':memory:');
		db.exec(`CREATE TABLE user (id text PRIMARY KEY)`);
		withMigrationsTable(db, journal.entries.length);
		expect(() => assertMigrated(db, ':memory:')).not.toThrow();
	});

	it('steps aside when told to', () => {
		process.env.ONTOPLANO_SKIP_MIGRATION_CHECK = 'true';
		const db = new Database(':memory:');
		expect(() => assertMigrated(db, ':memory:')).not.toThrow();
	});
});
