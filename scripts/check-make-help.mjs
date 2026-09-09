/**
 * Every make target says what it does.
 *
 * `make help` used to be a hand-written table covering about forty of the
 * ninety-odd targets. Tab-completion offered the rest with no way to tell what
 * they were — "This is crazy bro. It's too much." A generated help fixes the
 * stale half; this is what stops the gap reopening, because the rule "add a
 * line to help when you add a target" is a rule somebody has to remember.
 *
 * A description is `## text` directly above the target, or the first line of
 * the ordinary comment block above it — see `scripts/make-help.sh`.
 *
 *   node scripts/check-make-help.mjs [makefile ...]
 *
 * Only the public Makefile by default: local.mk and release.mk are not in this
 * repository, so a fresh clone has no opinion about them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (files.length === 0) files.push(join(ROOT, 'Makefile'));

const present = files.filter((f) => existsSync(f));
if (present.length === 0) {
	console.log('make help: nothing to check');
	process.exit(0);
}

const help = execFileSync('sh', [join(ROOT, 'scripts', 'make-help.sh'), ...present], {
	cwd: ROOT,
	encoding: 'utf8'
});

const bare = present.map((f) => f.replace(`${ROOT}/`, ''));
const missing = help
	.split('\n')
	.filter((line) => line.includes('(undocumented)'))
	.map((line) => line.trim().split(/\s+/)[0]);

if (missing.length > 0) {
	console.error(`\n${missing.length} make targets say nothing about themselves:\n`);
	for (const name of missing) console.error(`  ${name}`);
	console.error('\nPut a line above each, in the makefile it lives in:\n');
	console.error('  ## what it does, in one short phrase');
	console.error(`  ${missing[0]}:\n`);
	process.exit(1);
}

const listed = help.split('\n').filter((l) => /^ {2}\S/.test(l)).length;
console.log(`make help: ${listed} targets across ${bare.join(', ')}, all described`);
