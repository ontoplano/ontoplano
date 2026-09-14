/**
 * Putting an exported account back, on a server — and the copy it keeps first.
 *
 * The work of a restore is in `$lib/services/account-import.ts`, which a
 * device runs too: reading the file, checking its shape, and refilling every
 * table in one transaction. What is here is the one part that needs a disk —
 * a copy of what is about to be destroyed, written beside the database, which
 * exists whether or not anybody is still looking at the page.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectAccount } from '$lib/services/account-data.js';
import { importAccount as restore, type ImportResult } from '$lib/services/account-import.js';
import { dataDir } from '../config.js';

export * from '$lib/services/account-import.js';

/**
 * A copy of the account, on disk, before an import replaces it.
 *
 * An import empties the account and refills it from a file, in one transaction
 * — so if the file turns out to be the wrong one, or a year older than
 * somebody thought, there is nothing to go back to. The database snapshot the
 * deploy takes is the instance's; this is the person's.
 *
 * Written beside the database rather than handed to the browser: it is a
 * safety net rather than a download, and it has to exist whether or not
 * anybody is still looking at the page. Named for the account and the moment,
 * so an operator asked "can you put Ana back" has something to answer with —
 * the path is on the audit line the import writes.
 *
 * Best effort by design: a disk that will not take the copy is not a reason to
 * refuse somebody their own restore. It says so and carries on.
 */
export function keepBeforeImport(userId: string, now = new Date()): string | null {
	try {
		const dir = join(dataDir(), 'before-import');
		mkdirSync(dir, { recursive: true });

		const stamp = now.toISOString().replace(/[:.]/g, '-');
		const path = join(dir, `${userId}-${stamp}.json`);
		writeFileSync(path, JSON.stringify(collectAccount(userId, now)), { mode: 0o600 });

		// Somebody's whole account, in plain JSON. Keep a few and no more: this
		// is a way back from the last mistake, not an archive.
		const mine = readdirSync(dir)
			.filter((f) => f.startsWith(`${userId}-`) && f.endsWith('.json'))
			.sort();
		for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_BEFORE_IMPORT)))
			try {
				rmSync(join(dir, old));
			} catch {
				/* an old copy that will not go is not worth failing the restore */
			}

		return path;
	} catch (e) {
		console.error('import: could not keep a copy before replacing the account', e);
		return null;
	}
}

/** How many of those to keep per account. */
const KEEP_BEFORE_IMPORT = 3;

/**
 * Restore, with the safety copy taken first.
 *
 * The copy is the server's own addition: it is a net for an operator asked
 * "can you put Ana back", and the path lands on the audit line the import
 * writes. A device takes a different one — see its `page.isolated.ts` — because
 * a file beside the database there is a file nobody can reach.
 */
export async function importAccount(
	userId: string,
	payload: unknown,
	opts: { dropUnacceptable?: boolean } = {}
): Promise<ImportResult> {
	const rescue = keepBeforeImport(userId);
	return restore(userId, payload, { ...opts, rescue });
}
