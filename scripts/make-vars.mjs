/**
 * Which switches each make command takes, worked out from the recipes.
 *
 *   make vars                 every command that takes one
 *   make vars ONLY=shots      just that one
 *   node scripts/make-vars.mjs --check   fail if a switch has no description
 *
 * The old version of this printed one flat list of every `#:` marker in the
 * makefiles. Its own header claimed it "cannot miss one that was added
 * yesterday", and that was not true: it read markers somebody had written, so
 * a switch added without a marker was invisible, and a list of forty names
 * with no indication of which command reads which is not an answer to "what
 * does `make shots` take".
 *
 * So the mapping is derived. A recipe line that expands `$(FOO)` is a recipe
 * that reads FOO, and that is a fact about the makefile rather than about
 * anybody's diligence. Three things are then thrown away:
 *
 *   - make's own (MAKE, CURDIR, …), which nobody passes
 *   - anything a defaults.env sets, which is configuration and is listed
 *     separately at the bottom
 *   - anything the makefile computes for itself with `:=` or `=`
 *
 * What is left is what a command line can carry. `#:` markers no longer decide
 * *whether* a switch is listed — only what its description says — so the worst
 * an undescribed one can do is appear without a sentence, and `--check` makes
 * even that fail the build.
 *
 * Sub-makes are followed: `publish` runs `$(MAKE) release`, so it takes what
 * release takes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Make's own, which a recipe may expand and nobody passes on a command line. */
const AUTOMATIC = new Set([
	'MAKE',
	'MAKEFLAGS',
	'MAKECMDGOALS',
	'MAKEFILE_LIST',
	'CURDIR',
	'SHELL',
	'PWD',
	'HOME',
	'PATH'
]);

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const only = (argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const paths = argv.filter((a) => !a.startsWith('--'));

const makefiles = (
	paths.filter((f) => !f.endsWith('.env')).length > 0
		? paths.filter((f) => !f.endsWith('.env'))
		: [join(ROOT, 'Makefile')]
).filter((f) => existsSync(f));
const envfiles = paths.filter((f) => f.endsWith('.env')).filter((f) => existsSync(f));

if (makefiles.length === 0) {
	console.log('make vars: no makefile to read');
	process.exit(0);
}

const bold = process.stdout.isTTY ? '[1m' : '';
const dim = process.stdout.isTTY ? '[2m' : '';
const off = process.stdout.isTTY ? '[0m' : '';

/** Anything a defaults file sets is configuration, not a switch to type. */
const configured = new Set();
for (const file of envfiles) {
	for (const m of readFileSync(file, 'utf8').matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
		configured.add(m[1]);
	}
}

const described = new Map(); // NAME -> "NAME=example  what it does"
const computed = new Set();
const overridable = new Set();
const reads = new Map(); // target -> Set(VAR)
const calls = new Map(); // target -> Set(target)

for (const file of makefiles) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/^[ \t]*#:[ \t]+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm)) {
		if (!described.has(m[1])) described.set(m[1], m[2]);
	}

	let target = null;
	for (const line of text.split('\n')) {
		const assign = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\?=|:=|\+=|=)/);
		if (assign) {
			// `?=` is a default somebody may override, so it stays a switch;
			// `:=` and `=` are the makefile working something out for itself.
			(assign[2] === '?=' ? overridable : computed).add(assign[1]);
			continue;
		}

		const rule = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:([^=]|$)/);
		if (rule) {
			target = rule[1];
			if (!reads.has(target)) reads.set(target, new Set());
			if (!calls.has(target)) calls.set(target, new Set());
			continue;
		}

		// Recipes are the tab-indented lines; anything else at column zero that
		// is not a comment ends the recipe.
		if (!line.startsWith('\t')) {
			if (line.trim() !== '' && !line.startsWith('#')) target = null;
			continue;
		}
		if (!target) continue;

		/*
		 * Upper case only. A recipe is shell, and `$(mktemp)` is a command
		 * substitution rather than a variable; make's convention is capitals, so
		 * a lower-case name here is somebody's shell and not an argument.
		 */
		for (const m of line.matchAll(/\$[({]([A-Z][A-Z0-9_]*)[)}]/g)) reads.get(target).add(m[1]);
		for (const m of line.matchAll(/\$\(MAKE\)\s+(?:-s\s+)?([a-z][a-z0-9_-]*)/g)) {
			calls.get(target).add(m[1]);
		}
	}
}

const isSwitch = (name) =>
	!AUTOMATIC.has(name) && !configured.has(name) && (!computed.has(name) || overridable.has(name));

/** What a target takes, including whatever the targets it runs take. */
function switchesFor(target, seen = new Set()) {
	if (seen.has(target)) return new Set();
	seen.add(target);
	const out = new Set([...(reads.get(target) ?? [])].filter(isSwitch));
	for (const sub of calls.get(target) ?? []) {
		for (const name of switchesFor(sub, seen)) out.add(name);
	}
	return out;
}

const commands = [...reads.keys()]
	.filter((t) => !t.startsWith('_'))
	.map((t) => [t, [...switchesFor(t)].sort()])
	.filter(([, list]) => list.length > 0)
	.sort(([a], [b]) => a.localeCompare(b));

if (check) {
	const missing = new Map();
	for (const [target, list] of commands) {
		for (const name of list) {
			if (described.has(name)) continue;
			if (!missing.has(name)) missing.set(name, new Set());
			missing.get(name).add(target);
		}
	}
	if (missing.size > 0) {
		console.error('\nSwitches a make command takes, with nothing saying what they are:\n');
		for (const [name, who] of [...missing].sort(([a], [b]) => a.localeCompare(b))) {
			console.error(`  ${name.padEnd(20)} taken by ${[...who].sort().join(', ')}`);
		}
		console.error('\nPut a line next to whatever reads it:\n');
		console.error(`  #: ${[...missing.keys()][0]}=value  what it does\n`);
		console.error('A value the deployment sets belongs in a defaults.env instead.\n');
		process.exit(1);
	}
	console.log(`make vars: ${commands.length} commands take switches, all described`);
	process.exit(0);
}

const wanted = only ? commands.filter(([t]) => t === only) : commands;
if (only && wanted.length === 0) {
	console.log(`make vars: \`${only}\` takes no switches`);
	process.exit(0);
}

console.log(`${bold}what each command takes${off}\n`);
for (const [target, list] of wanted) {
	console.log(`${bold}${target}${off}`);
	for (const name of list) {
		const said = described.get(name);
		// The marker is written as `NAME=example  what it does`; without one, the
		// name is still the truth — it is read by this recipe either way.
		const [example, ...rest] = said ? said.split(/ {2,}/) : ['', ''];
		const shown = said ? `${name}=${example}` : name;
		console.log(`  ${shown.padEnd(34)} ${rest.join(' ').trim()}`);
	}
	console.log('');
}

/*
 * And a pointer to the other kind, rather than the other kind.
 *
 * This used to end by dumping every key in every defaults.env — sixty lines of
 * hostnames and ports under four lines of answer, which is how "what does
 * `make shots` take" became unanswerable. Those are set once in a file and
 * read there; the question this command exists for is what a command line
 * carries.
 */
const files = [...new Set(envfiles)];
if (files.length > 0 && !only) {
	console.log(`${dim}Values set once, rather than typed, live in${off}`);
	for (const file of files) console.log(`${dim}  ${file}${off}`);
	console.log('');
}
