/**
 * A migration is written once and never touched again.
 *
 * Drizzle records each applied migration as the sha256 of its file, so editing
 * one after it has run anywhere turns every database that ran it into a
 * stranger the migrator refuses — correctly, and at the worst moment, which is
 * a deploy. Two instances hit exactly that: they held `0070_stiff_giant_man`
 * under the hash it had between being generated and being hand-edited, and
 * neither would start.
 *
 * The window is small and entirely avoidable: generate, then leave it alone. A
 * backfill or a constraint the generator missed goes in its own migration,
 * which costs one file and cannot strand anybody.
 *
 * This compares the working tree against `HEAD`, so an edit to a committed
 * migration fails `make lint` while it is still a local change — before it can
 * reach a database that is not yours.
 */
import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';

/** Migration files that differ from the last commit, whatever the change. */
function changedSinceHead(): string[] {
	try {
		return execFileSync('git', ['diff', 'HEAD', '--name-only', '--', 'drizzle/*.sql'], {
			encoding: 'utf8'
		})
			.trim()
			.split('\n')
			.filter(Boolean);
	} catch {
		// No git here — a tarball, a container without the history. Nothing to
		// compare against, and nothing to be wrong about.
		return [];
	}
}

/** Migration files a commit has ever modified after adding them. */
function everModified(): string[] {
	try {
		return execFileSync(
			'git',
			['log', '--diff-filter=M', '--format=', '--name-only', '--', 'drizzle/*.sql'],
			{ encoding: 'utf8' }
		)
			.trim()
			.split('\n')
			.filter(Boolean);
	} catch {
		return [];
	}
}

describe('a migration, once written', () => {
	test('is not edited in the working tree', () => {
		expect(
			changedSinceHead(),
			'A committed migration has been changed. Every database that already ran it\n' +
				'records the old hash and will be refused by the migrator. Put the change in a\n' +
				'new migration instead.'
		).toEqual([]);
	});

	test('has never been edited in the history either', () => {
		expect(
			everModified(),
			'These migrations were modified after being committed, which strands any\n' +
				'database that ran the earlier version.'
		).toEqual([]);
	});
});
