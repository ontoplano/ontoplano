import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { snapshot } from '../scripts/db-snapshot.mjs';

/**
 * `VACUUM INTO` refuses to write over an existing file, so the snapshot name
 * has to be unique per call rather than per second. It was per second, and the
 * second snapshot of the same second failed the whole command it was part of —
 * a migration, most of the time, which is when somebody least wants a failure
 * they have to read carefully.
 */
describe('db snapshot', () => {
	let dir: string;
	let path: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'onto-snap-'));
		path = join(dir, 'ontoplano.db');
		const db = new Database(path);
		db.exec('CREATE TABLE thing (id INTEGER PRIMARY KEY, name TEXT)');
		db.prepare('INSERT INTO thing (name) VALUES (?)').run('one');
		db.close();
		process.env.DATABASE_URL = path;
		vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		delete process.env.DATABASE_URL;
		rmSync(dir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('takes two snapshots in the same moment without failing', () => {
		const first = snapshot('test');
		const second = snapshot('test');

		expect(first).toBeTruthy();
		expect(second).toBeTruthy();
		expect(second).not.toBe(first);
		expect(readdirSync(dir).filter((f) => f.includes('.test-'))).toHaveLength(2);
	});

	it('copies the data, not an empty file', () => {
		const out = snapshot('test')!;
		const copy = new Database(out, { readonly: true });
		expect(copy.prepare('SELECT name FROM thing').get()).toEqual({ name: 'one' });
		copy.close();
	});

	it('says nothing to snapshot when there is no database', () => {
		process.env.DATABASE_URL = join(dir, 'absent.db');
		expect(snapshot('test')).toBeNull();
	});
});
