/**
 * Everything the migrator imports is on the list that ships it.
 *
 * `scripts/migrate.mjs` runs on the box on its own — the deploy copies it and
 * its neighbours into the deployed directory, and nothing else from `scripts/`
 * goes with them. The list of neighbours was written out by hand in three
 * recipes, so the day the migrator gained one, production stopped mid-deploy:
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module
 *     '/home/…/ontoplano/app/scripts/data-steps.mjs'
 *     imported from /home/…/ontoplano/app/scripts/migrate.mjs
 *
 * The same shape of mistake had already broken eight test files that copy the
 * migrator into a scratch tree; those derive the list now. The deploy cannot,
 * because the copying is `rsync` in a makefile — so this reads both sides and
 * refuses a migrator whose imports the makefile does not carry.
 *
 * It runs from `make lint`, which is what makes it true rather than intended:
 * the failure it exists for happens on the box, after the snapshot, with the
 * old version already stopped.
 *
 *   node scripts/check-ship-list.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'scripts/migrate.mjs';

/** Where the deploy names the files it copies beside the migrator. */
const MAKEFILE = 'local.mk';
const LIST = /^MIGRATOR_FILES\s*=\s*((?:.*\\\n)*.*)$/m;

/** `import … from './db-snapshot.mjs'` — the relative ones, which are ours. */
const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g;

/** Every file the entry point reaches, however deep. */
function reached(rel, seen = new Set()) {
	if (seen.has(rel)) return seen;
	seen.add(rel);
	const source = join(ROOT, rel);
	for (const [, spec] of readFileSync(source, 'utf8').matchAll(RELATIVE_IMPORT))
		reached(relative(ROOT, resolve(dirname(source), spec)), seen);
	return seen;
}

let makefile;
try {
	makefile = readFileSync(join(ROOT, MAKEFILE), 'utf8');
} catch {
	// A fresh clone has no deploy makefile — it is the maintainer's, and its
	// absence is not this repository's problem.
	console.log(`ship list: no ${MAKEFILE} here, nothing to check`);
	process.exit(0);
}

const declared = LIST.exec(makefile);
if (!declared) {
	console.error(`${MAKEFILE} no longer defines MIGRATOR_FILES, which is what ships the migrator.`);
	process.exit(1);
}

const shipped = new Set(declared[1].replace(/\\\n/g, ' ').trim().split(/\s+/).filter(Boolean));
const missing = [...reached(ENTRY)].filter((one) => !shipped.has(one));

if (missing.length > 0) {
	console.error(`\n${ENTRY} imports files the deploy does not copy:\n`);
	for (const one of missing) console.error(`  ${one}`);
	console.error(
		`\nAdd them to MIGRATOR_FILES in ${MAKEFILE}. Without it the deploy stops on\n` +
			'the box with ERR_MODULE_NOT_FOUND, after the snapshot and after the old\n' +
			'version has been stopped.\n'
	);
	process.exit(1);
}

console.log(`ship list: the migrator reaches ${reached(ENTRY).size} files, all of them shipped`);
