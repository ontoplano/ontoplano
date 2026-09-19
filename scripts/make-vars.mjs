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
 * Sub-makes and prerequisites are both followed: `publish` runs
 * `$(MAKE) release`, and `deploy` has `_confirm` and `build` in front of it, so
 * all three take what those take. Following only sub-makes was how `deploy`
 * came to list two switches out of eight — everything it reads, it reads
 * through a prerequisite.
 *
 * Two things a defaults.env sets are switches after all. One is a value a
 * recipe *tests* rather than uses: `DEPLOY_DOCS=true` is there so a hoster can
 * say once that deploys leave the docs alone, and `[ "$(DEPLOY_DOCS)" = false ]`
 * is a command line saying it for one run. The other is a value somebody wrote
 * a `#:` line for, which is somebody saying it is meant to be typed —
 * ONTOPLANO_ORIGIN has a default and is still the whole point of
 * `make android ONTOPLANO_ORIGIN=…`. A marker rescues a `:=` name the same
 * way: a command line beats `:=` too, so `make android-lan LAN_IP=…` works and
 * only the marker says it is meant to. All of that only ever *adds* a name, so
 * none of it can hide one; a name that is only interpolated into a command and
 * has nothing written about it — a host, a port, a path — is configuration and
 * stays out.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Make's own and the shell's, which a recipe may expand and nobody passes on a
 * make command line. `XDG_*` is the whole family: where a desktop keeps its
 * data is the environment's business, not a switch.
 */
const AUTOMATIC = new Set([
	'MAKE',
	'MAKEFLAGS',
	'MAKECMDGOALS',
	'MAKEFILE_LIST',
	'CURDIR',
	'SHELL',
	'PWD',
	'HOME',
	'PATH',
	'USER',
	'TMPDIR',
	'EDITOR',
	'TERM',
	'LANG'
]);

const environmental = (name) => AUTOMATIC.has(name) || name.startsWith('XDG_');

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
const tested = new Set(); // VAR compared against a literal, i.e. flipped not filled
const internal = new Set(); // VAR the makefile sets for one target, so it decides it
const reads = new Map(); // target -> Set(VAR)
const calls = new Map(); // target -> Set(target)
const needs = new Map(); // target -> Set(target it is built after)
const behind = new Map(); // computed VAR -> Set(VAR it is worked out from)
const from = new Map(); // computed VAR -> the text it is worked out from

for (const file of makefiles) {
	const text = readFileSync(file, 'utf8');
	for (const m of text.matchAll(/^[ \t]*#:[ \t]+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm)) {
		if (!described.has(m[1])) described.set(m[1], m[2]);
	}

	// Tested against a literal, in the shell and in make's own conditionals.
	for (const m of text.matchAll(/\[\s+"?\$[({]([A-Z][A-Z0-9_]*)[)}]"?\s+!?=/g)) tested.add(m[1]);
	for (const m of text.matchAll(/\$\(filter[^,]*,\s*\$[({]([A-Z][A-Z0-9_]*)[)}]/g))
		tested.add(m[1]);
	/*
	 * `ifeq ($(FLAG),1)`, which is the third way a switch gets read and was the
	 * one this did not know about. A flag documented with `#:` and branched on
	 * this way was described and then left out of the listing entirely — and a
	 * derivation with a hole in it is worse than no derivation, because the
	 * listing reads as complete.
	 */
	for (const m of text.matchAll(/^[ \t]*ifn?eq[ \t]*\(\s*\$[({]([A-Za-z_][A-Za-z0-9_]*)[)}]/gm))
		tested.add(m[1]);

	let target = null;
	for (const line of text.split('\n')) {
		const assign = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\?=|:=|\+=|=)(.*)$/);
		if (assign) {
			// `?=` is a default somebody may override, so it stays a switch;
			// `:=` and `=` are the makefile working something out for itself.
			(assign[2] === '?=' ? overridable : computed).add(assign[1]);
			/*
			 * …and what it works it out from, because that is where a switch
			 * hides. `PACKAGE_BUILD_DEP := $(if $(filter false,$(PACKAGE_BUILD)),,build)`
			 * means `package` takes PACKAGE_BUILD, and nothing in the recipe says
			 * so — the recipe only ever sees the prerequisite.
			 */
			from.set(assign[1], assign[3]);
			if (!behind.has(assign[1])) behind.set(assign[1], new Set());
			for (const m of assign[3].matchAll(/\$[({]([A-Z][A-Z0-9_]*)[)}]/g)) {
				behind.get(assign[1]).add(m[1]);
			}
			continue;
		}

		// `deploy-app: CONFIRM_SCOPE = app` — the makefile telling one target
		// something. It wins over the `?=` that gives the same name its default,
		// because a name the makefile sets per target is one the makefile
		// decides: CONFIRM_SCOPE says which command is asking to confirm, and
		// nobody types it.
		const local = line.match(/^[a-zA-Z_][a-zA-Z0-9_ -]*:\s*([A-Z_][A-Z0-9_]*)\s*[:?+]?=/);
		if (local) {
			internal.add(local[1]);
			continue;
		}

		// Underscore names too. `_confirm` is where `deploy` reads DEPLOY_YES,
		// and a rule regex that would not match its own name read none of it.
		const rule = line.match(/^([a-zA-Z_][a-zA-Z0-9_./-]*)\s*:([^=]|$)/);
		if (rule) {
			target = rule[1];
			if (!reads.has(target)) reads.set(target, new Set());
			if (!calls.has(target)) calls.set(target, new Set());
			if (!needs.has(target)) needs.set(target, new Set());
			// The prerequisites count too: a target whose dependency is computed
			// from a switch takes that switch, and one that is built after
			// another takes what that one takes.
			const prereqs = line.slice(rule[1].length).replace(/^\s*:/, '');
			for (const m of prereqs.matchAll(/\$[({]([A-Z][A-Z0-9_]*)[)}]/g)) reads.get(target).add(m[1]);
			for (const m of prereqs.matchAll(/(?:^|\s)([a-zA-Z_][a-zA-Z0-9_-]*)/g)) {
				needs.get(target).add(m[1]);
			}
			continue;
		}

		/*
		 * Make's own conditionals sit at column zero inside a recipe.
		 *
		 * `ifeq ($(FLAG),1)` / `else` / `endif` wrap a recipe rather than
		 * ending it, and reading them as the end of one made every switch
		 * below them belong to whichever target came next — so a target with a
		 * conditional in it reported "takes no switches" and handed its own to
		 * a neighbour.
		 */
		if (/^\s*(?:ifn?eq|ifn?def|else|endif)\b/.test(line)) {
			// And what it branches on is a switch that target takes — it is the
			// only place some of them are ever named.
			if (target)
				for (const m of line.matchAll(/\$[({]([A-Z][A-Z0-9_]*)[)}]/g)) reads.get(target).add(m[1]);
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
	!environmental(name) &&
	!internal.has(name) &&
	(!configured.has(name) || tested.has(name) || described.has(name)) &&
	(!computed.has(name) || overridable.has(name) || described.has(name));

/**
 * A name, resolved to the switches it stands for: itself if it is one, and
 * whatever it is computed from if it is not.
 */
function resolve(name, seen = new Set()) {
	if (seen.has(name)) return [];
	seen.add(name);
	if (isSwitch(name)) return [name];
	return [...(behind.get(name) ?? [])].flatMap((from) => resolve(from, seen));
}

/**
 * The targets a prerequisite stands for: itself when it is one, and when it is
 * a variable — `deploy: _confirm $(BUILD_DEP)` — whatever targets its value
 * names.
 */
function prerequisites(target) {
	const out = new Set();
	for (const name of needs.get(target) ?? []) {
		if (reads.has(name)) out.add(name);
		for (const m of (from.get(name) ?? '').matchAll(/(?:^|[\s,)])([a-z_][a-z0-9_-]*)/g)) {
			if (reads.has(m[1])) out.add(m[1]);
		}
	}
	for (const name of reads.get(target) ?? []) {
		for (const m of (from.get(name) ?? '').matchAll(/(?:^|[\s,)])([a-z_][a-z0-9_-]*)/g)) {
			if (reads.has(m[1])) out.add(m[1]);
		}
	}
	return out;
}

/**
 * What a target takes: what its own recipe reads, plus whatever the targets it
 * runs and the targets it is built after take. `make deploy` builds and
 * confirms before it ships, so NODE_OPTIONS and DEPLOY_YES are as much its
 * switches as anything its own recipe expands.
 */
function switchesFor(target, seen = new Set()) {
	if (seen.has(target)) return new Set();
	seen.add(target);
	const out = new Set([...(reads.get(target) ?? [])].flatMap((name) => resolve(name)));
	for (const sub of [...(calls.get(target) ?? []), ...prerequisites(target)]) {
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
