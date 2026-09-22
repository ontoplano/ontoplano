/**
 * The migrator, stood up in a scratch tree.
 *
 * A migration test rewinds the journal to just before the migration it is
 * about, builds an old database, and runs the real `scripts/migrate.mjs`
 * against it — which means the scratch tree needs the migrator and everything
 * the migrator imports. Each test used to list those files itself, so the day
 * `migrate.mjs` gained a neighbour, eight test files failed with
 * `ERR_MODULE_NOT_FOUND` and every one of them needed the same line added.
 *
 * So the list is derived instead: follow the script's own relative imports and
 * copy what they name, however deep. A file the migrator stops importing stops
 * being copied, and nobody has to remember either way.
 */
import { cpSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ENTRY = 'scripts/migrate.mjs';

/** `import … from './db-snapshot.mjs'` — the relative ones, which are ours. */
const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g;

function copyScript(rel: string, work: string, seen: Set<string>) {
	if (seen.has(rel)) return;
	seen.add(rel);

	const source = join(ROOT, rel);
	mkdirSync(join(work, dirname(rel)), { recursive: true });
	cpSync(source, join(work, rel));

	const text = readFileSync(source, 'utf8');
	for (const [, spec] of text.matchAll(RELATIVE_IMPORT))
		copyScript(relative(ROOT, resolve(dirname(source), spec)), work, seen);
}

/**
 * Copy the migrations and the migrator into `work`, and lend it node_modules.
 *
 * The symlink rather than a copy: `better-sqlite3` is a compiled binary and
 * the tree is thrown away at the end of the file.
 */
export function installMigrator(work: string) {
	cpSync(join(ROOT, 'drizzle'), join(work, 'drizzle'), { recursive: true });
	copyScript(ENTRY, work, new Set());
	symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'));
}
