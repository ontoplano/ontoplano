import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';

/**
 * The development seed, run where its pictures are not.
 *
 * This is a regression test for a data loss nobody would have looked for. The
 * seed reads three photographs off disk, and the deploy shipped four named
 * scripts to the demo box without the directory holding them — so `readFileSync`
 * threw a third of the way down, the script stopped where it stood, and
 * everything below that point never ran. What the demo lost was a notebook's
 * worth of reading notes, nine weeks of history and every review, and nothing
 * anywhere said so: the reset "succeeded" and the demo was simply emptier.
 *
 * So the rule this pins is not "the pictures are there". It is that a missing
 * decoration cannot take the data with it.
 */
const ROOT = join(import.meta.dirname, '..');

const work = mkdtempSync(join(tmpdir(), 'seed-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A tree with the seed and no `demo-media/`, and a database for it to fill. */
function seedWithoutPictures(): Database.Database {
	mkdirSync(join(work, 'scripts'), { recursive: true });
	for (const file of ['seed-dev.mjs', 'db-snapshot.mjs']) {
		cpSync(join(ROOT, 'scripts', file), join(work, 'scripts', file));
	}
	symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'));

	const db = join(work, 'seeded.db');
	execFileSync('node', ['scripts/migrate.mjs'], {
		cwd: ROOT,
		env: { ...process.env, DATABASE_URL: db },
		stdio: 'pipe'
	});

	// An account for the seed to fill: it seeds whoever it finds.
	const handle = new Database(db);
	const now = new Date().toISOString();
	handle
		.prepare(
			'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, 0, ?, ?)'
		)
		.run('seed-test-user', 'Seed', 'seed@test.invalid', now, now);
	handle.close();

	execFileSync('node', ['scripts/seed-dev.mjs', db], { cwd: work, stdio: 'pipe' });
	return new Database(db, { readonly: true });
}

describe('the seed, without its pictures', () => {
	test('fills the account anyway, all the way to the end', () => {
		const db = seedWithoutPictures();

		// The notebook whose notes sit *below* the picture step. This is the one
		// that went missing, and it is the reason this file exists.
		const republic = db.prepare("select id from notebooks where title = 'The Republic'").get() as
			| { id: number }
			| undefined;
		expect(republic, 'The Republic notebook was not created').toBeTruthy();

		const notes = db
			.prepare('select count(*) n from diary_entries where notebook_id = ?')
			.get(republic!.id) as { n: number };
		expect(notes.n).toBeGreaterThan(3);

		// And the history, which is the very last thing the seed writes.
		const history = db.prepare('select count(*) n from task_records').get() as { n: number };
		expect(history.n).toBeGreaterThan(50);

		// No pictures, and that is the only thing that should be missing.
		const media = db.prepare('select count(*) n from media').get() as { n: number };
		expect(media.n).toBe(0);

		db.close();
	});
});
