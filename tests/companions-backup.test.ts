/**
 * The Backups row on the instance page.
 *
 * The pull runs on another machine — that is what makes it a backup — so the
 * app learns about it from the stamp each verified pull leaves beside the
 * database, not from a timer on its own box.
 */
import { afterAll, describe, expect, test } from 'vitest';
import { rmSync, utimesSync, writeFileSync } from 'node:fs';
import { makeDatabase } from './helpers/db';

const database = makeDatabase();
afterAll(() => database.remove());

const HOUR = 3_600_000;

describe('the backups row', () => {
	test('reads a fresh pull from the stamp, naming the machine that made it', async () => {
		const { companions, BACKUP_STAMP_SUFFIX } =
			await import('../src/lib/server/services/companions');
		const stamp = database.path + BACKUP_STAMP_SUFFIX;
		writeFileSync(stamp, 'lobo\n');

		const row = (await companions()).find((r) => r.label === 'ops.backups')!;
		expect(row.status).toBe('running');
		expect(row.detail).toContain('by lobo');
		expect(row.fix).toBe('');

		// Hours old: the machine that pulls has stopped, and the row says so.
		const old = (Date.now() - 5 * HOUR) / 1000;
		utimesSync(stamp, old, old);
		const stale = (await companions()).find((r) => r.label === 'ops.backups')!;
		expect(stale.status).toBe('stopped');
		expect(stale.detail).toContain('5 hours ago');
		expect(stale.fix).toContain('systemctl');

		// No stamp at all falls back to looking for a timer here.
		rmSync(stamp);
		const none = (await companions()).find((r) => r.label === 'ops.backups')!;
		expect(none.detail).not.toContain('pulled');
	});
});
