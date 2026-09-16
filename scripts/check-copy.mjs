#!/usr/bin/env node
/**
 * How much of the app is still written in English in its own source.
 *
 *   node scripts/check-copy.mjs            list what is left, per file
 *   node scripts/check-copy.mjs --check    fail if any file went backwards
 *   node scripts/check-copy.mjs --record   write the counts down as the new floor
 *
 * Moving every sentence in a hundred-odd components into `messages/` is not one
 * commit, and a migration with no ratchet is a migration that goes backwards on
 * the first busy afternoon. So this counts the literals still sitting in the
 * markup, remembers the count per file, and fails when a file has more than it
 * had — which makes "everything is translatable" a thing that arrives rather
 * than a thing that was intended.
 *
 * A file at zero stays at zero: the floor is a floor, so the first hardcoded
 * string added back to a converted screen is a failing check rather than a
 * sentence somebody finds in Portuguese six months later.
 *
 * What counts as copy: text a person reads. The words between tags; the
 * attributes that are read aloud or shown — `aria-label`, `title`,
 * `placeholder`, `alt`, `label`; and, in the script, a string given to one of
 * those same names, because a tab strip built as a list of `{ href, label }`
 * is as visible as a heading and used to be invisible to this.
 *
 * Not class names, not route ids, not anything inside a `{...}` — an
 * expression is either already a message or a value.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* A dotfile, so the language generator does not read it as a language. */
const BASELINE = join(ROOT, 'messages/.untranslated.json');
const CHECK = process.argv.includes('--check');
const RECORD = process.argv.includes('--record');

/**
 * Where the app's own screens are, and the modules that hand them words.
 *
 * `src/lib` is here for the second: a room's tab strip, a section's blurb and a
 * style's hint are prose that happens to live in a `.ts`. Nothing generated —
 * `src/lib/i18n` is where the words go, not where they are left.
 */
const ROOTS = ['src/lib', 'src/routes'];

/*
 * Two things in here are not app copy.
 *
 * `src/lib/i18n` is where the words go rather than where they are left. And an
 * MCP tool's description is a machine interface: it is read by a model against
 * a schema that other software holds a copy of, and translating it would change
 * an API rather than a screen. The same goes for what a JSON route says back —
 * the screen that shows it is what a person reads, and the screen is counted.
 */
const SKIP = ['src/lib/i18n', 'src/lib/server/mcp', 'src/routes/api'];

function walk(dir, found = []) {
	if (SKIP.some((skip) => dir === skip || dir.startsWith(`${skip}/`))) return found;
	for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) walk(path, found);
		else if (entry.name.endsWith('.svelte')) found.push(path);
		// A `.ts` has no markup; only the names below are read out of it.
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(path);
	}
	return found;
}

/**
 * The markup, with everything that is not markup taken out.
 *
 * Script and style blocks go first — a string in a component's script is a
 * different problem, and its class names are not copy. Comments go too: a
 * comment is for whoever reads the code, and this repository's are long.
 */
function markupOf(source) {
	return source
		.replace(/<script[\s\S]*?<\/script>/g, '')
		.replace(/<style[\s\S]*?<\/style>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
}

/** Letters, in any language — a string of punctuation or digits is not copy. */
const WORDS = /\p{L}{2,}/u;

/**
 * Things that look like prose and are not.
 *
 * Svelte block keywords survive the tag-stripping below as bare words, and an
 * HTML entity is a character rather than a sentence.
 */
/**
 * A message key, not a sentence.
 *
 * Once a module's prose has moved, what is left in the field is the key that
 * replaced it — `tour.thisIsOntoplano`. Dotted, no spaces: prose has spaces and
 * a key does not, which is enough to tell them apart and cheap enough to be
 * obviously right.
 */
const LOOKS_LIKE_A_KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

const NOT_COPY = [
	LOOKS_LIKE_A_KEY,
	// The app's own name. A brand is the same word in every language, and
	// leaving it out of the count keeps the number honest.
	/^Ontoplano$/,
	/^&[a-z]+;$/i,
	/^(if|else|each|await|then|catch|const|snippet|render|key|as)$/,
	/^[\d\s\p{P}\p{S}]+$/u
];

/**
 * The names that carry words wherever they appear.
 *
 * As an attribute in the markup and as a property in the script: `label:` in a
 * list of tabs reaches a person exactly as `label=` on an element does.
 */
const COPY_NAMES = [
	'aria-label',
	'aria-description',
	'aria-placeholder',
	'title',
	'placeholder',
	'alt',
	'label',
	// This repository's own two words for a sentence under a heading.
	'blurb',
	'hint'
];

/** The script of a component, with its comments gone. */
function scriptOf(source, hasMarkup = true) {
	const code = hasMarkup
		? [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
		: source;
	return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
}

/** The words between tags, and the attributes and properties a person reads. */
export function copyIn(source, { markup: hasMarkup = true } = {}) {
	const markup = hasMarkup ? markupOf(source) : '';
	const found = [];

	/*
	 * A word handed to a `label:` in the script.
	 *
	 * Only the quoted ones: `label: t('…')` is already a message and
	 * `label: thing.name` is a value. Only these names, because widening it to
	 * every string in a script counts class names and route ids as prose.
	 */
	for (const match of scriptOf(source, hasMarkup).matchAll(
		new RegExp(
			`\\b(?:${COPY_NAMES.map((n) => n.replace('-', '_')).join('|')})\\s*:\\s*'([^']*)'`,
			'g'
		)
	)) {
		const value = match[1].trim();
		if (value && WORDS.test(value) && !LOOKS_LIKE_A_KEY.test(value)) found.push(value);
	}

	/*
	 * Attributes first, while the tags are still tags.
	 *
	 * Only the ones that reach a person: a `title` is shown, an `aria-label` is
	 * read aloud, an `alt` stands in for the picture. A value containing `{` is
	 * already an expression and is somebody else's problem.
	 */
	for (const match of markup.matchAll(
		new RegExp(`\\b(?:${COPY_NAMES.join('|')})="([^"]*)"`, 'g')
	)) {
		const value = match[1].trim();
		if (!value || value.includes('{') || !WORDS.test(value)) continue;
		found.push(value);
	}

	/*
	 * Then the text, by removing the tags and keeping what is between them.
	 *
	 * Expressions go first and whole: `{t('a.b')}` is a message already, and
	 * `{count}` is a value — neither is a sentence somebody has to translate,
	 * and both would otherwise leave their innards behind as loose words.
	 */
	const text = markup.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ').replace(/<[^>]*>/g, '\n');

	for (const line of text.split('\n')) {
		const run = line.trim();
		if (!run || !WORDS.test(run)) continue;
		if (NOT_COPY.some((pattern) => pattern.test(run))) continue;
		found.push(run);
	}

	return found;
}

const files = ROOTS.filter((dir) => existsSync(join(ROOT, dir))).flatMap((dir) => walk(dir));
const counts = {};
const examples = {};

for (const file of files.sort()) {
	const copy = copyIn(readFileSync(join(ROOT, file), 'utf8'), {
		markup: file.endsWith('.svelte')
	});
	if (!copy.length) continue;
	counts[file] = copy.length;
	examples[file] = copy.slice(0, 3);
}

const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

if (RECORD) {
	writeFileSync(BASELINE, `${JSON.stringify({ total, files: counts }, null, '\t')}\n`, 'utf8');
	console.log(`copy: ${total} literal(s) across ${Object.keys(counts).length} file(s) — recorded.`);
	process.exit(0);
}

if (!CHECK) {
	for (const [file, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
		console.log(`${String(count).padStart(5)}  ${file}`);
	}
	console.log(`\n${total} literal(s) across ${Object.keys(counts).length} file(s).`);
	process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

if (!baseline) {
	console.error('No floor recorded yet. Run: node scripts/check-copy.mjs --record');
	process.exit(1);
}

const worse = [];
for (const [file, count] of Object.entries(counts)) {
	const was = baseline.files[file];
	// A file the floor has never seen is a new screen, and a new screen has no
	// excuse: it is being written now, with `messages/` already there.
	const allowed = was ?? 0;
	if (count > allowed) worse.push({ file, was: allowed, now: count, examples: examples[file] });
}

if (worse.length) {
	console.error('copy: these files have more untranslated text than they did.\n');
	for (const { file, was, now, examples: sample } of worse) {
		console.error(`  ${file}: ${was} → ${now}`);
		for (const line of sample) console.error(`      ${line.slice(0, 72)}`);
	}
	console.error(
		'\nPut the new strings in messages/en.json and reach them with t(), or — if a file ' +
			'genuinely gained copy that is already translated — run:\n' +
			'  node scripts/check-copy.mjs --record'
	);
	process.exit(1);
}

const gone = baseline.total - total;
console.log(
	gone > 0
		? `copy: ${total} literal(s) left, ${gone} fewer than the floor. Run --record to keep it.`
		: `copy: ${total} literal(s) left to translate.`
);
