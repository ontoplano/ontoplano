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
const SKIP = [
	'src/lib/i18n',
	'src/lib/server/mcp',
	'src/routes/api',
	/*
	 * One exception, written down rather than quietly excluded.
	 *
	 * `assistant-notify.ts` builds "added 3 todos" out of a tool's own name —
	 * verb from a table, noun from the identifier, plural from an `s`. That is
	 * English grammar in TypeScript over words that are not words, and making
	 * it translatable is a redesign rather than a sweep. Its header says the
	 * same thing; this is what stops the counter calling it undone work.
	 */
	'src/lib/server/services/assistant-notify.ts'
];

function walk(dir, found = []) {
	if (SKIP.some((skip) => dir === skip || dir.startsWith(`${skip}/`))) return found;
	for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) walk(path, found);
		else if (SKIP.includes(path)) continue;
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

/** An SVG path: a letter, then numbers, all the way down. */
const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz][\d.\s,-]/;

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
	// This repository's own words for a sentence under a heading, as an
	// attribute on `<Field>` as well as a property in a list.
	'blurb',
	'hint',
	'help',
	// `<Card description=…>` — the sentence under a card's heading.
	'description'
];

/**
 * The stretches of markup a person actually reads.
 *
 * Walked rather than matched. A regex cannot do this: an attribute holds an
 * expression (`onclick={() => …}`), an expression holds `>` and `<`, and a
 * class holds `[&>svg]` — so anything that treats the first `>` as the end of a
 * tag walks out of the tag and reads the rest of it as prose. Braces are
 * counted wherever they are, being inside a tag is remembered across them, and
 * a quoted attribute is skipped whole.
 */
function textRuns(markup) {
	const runs = [];
	let inTag = false;
	let braces = 0;
	let quote = '';
	let start = -1;

	const close = (at) => {
		if (start >= 0) runs.push(markup.slice(start, at));
		start = -1;
	};

	for (let i = 0; i < markup.length; i++) {
		const c = markup[i];

		if (braces > 0) {
			if (c === '{') braces++;
			else if (c === '}') braces--;
			continue;
		}
		if (quote) {
			if (c === quote) quote = '';
			continue;
		}
		if (c === '{') {
			if (!inTag) close(i);
			braces = 1;
			continue;
		}
		if (inTag) {
			if (c === '"' || c === "'") quote = c;
			else if (c === '>') inTag = false;
			continue;
		}
		if (c === '<') {
			close(i);
			inTag = true;
			continue;
		}
		if (start < 0) start = i;
	}
	close(markup.length);
	return runs;
}

/** The script of a component, with its comments gone. */
function scriptOf(source, hasMarkup = true) {
	const code = hasMarkup
		? [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
		: source;
	return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
}

/**
 * The quoted words inside an expression in the markup.
 *
 * `title={editing ? 'Edit to-do' : 'New to-do'}` is two sentences a person
 * reads, and everything above is blind to them: they sit inside a `{…}`, which
 * the walker skips because most of what is in there is code. Sentences are
 * told from code the only way that works without parsing — a string with a
 * space in it and no code punctuation is prose.
 */
const CODEY = /[<>{}$\\]|^[a-z-]+$|^[A-Z_]+$|\//;

/**
 * A list of class names, not a sentence.
 *
 * `border-gray-400 bg-gray-400` has spaces and words and is styling. Prose in
 * this app starts with a capital or ends in a full stop; a run of lowercase
 * tokens that all carry a hyphen or a colon is Tailwind.
 */
const CLASSES = (text) => {
	if (/[A-Z]/.test(text)) return false;
	const tokens = text.split(/\s+/);
	// Most of them, not all: `flex items-center gap-2` is styling and `flex`
	// carries no hyphen, while a sentence with one hyphenated word in it is
	// still a sentence.
	return tokens.filter((token) => /[-:]/.test(token)).length * 2 > tokens.length;
};

function prosyLiterals(source) {
	const found = [];
	let braces = 0;

	/*
	 * A `//` comment inside an expression goes first.
	 *
	 * An apostrophe in one — `// the browser's own refusal` — opens a string
	 * that runs to the next real quote, and everything between reads as prose.
	 * Blanked rather than skipped inline, because a comment can hold anything.
	 */
	const markup = source.replace(
		/(^|[^:])\/\/[^\n]*/g,
		(m, lead) => lead + ' '.repeat(m.length - lead.length)
	);

	for (let i = 0; i < markup.length; i++) {
		const c = markup[i];
		if (braces === 0) {
			if (c === '{') braces = 1;
			continue;
		}
		if (c === '{') braces++;
		else if (c === '}') braces--;
		if (braces === 0) continue;

		if (c === "'" || c === '"') {
			const quote = c;
			const from = i;
			let j = i + 1;
			let buffer = '';
			while (j < markup.length && markup[j] !== quote) {
				if (markup[j] === '\\') j++;
				buffer += markup[j];
				j++;
			}
			i = j;
			const text = buffer.trim();
			// Prose has a space in it and no punctuation that belongs to code.
			// A quote that follows a letter ends a string this walk never saw
			// starting; reading on from it captures code between two strings.
			const before = markup[from - 1] ?? ' ';
			if (/[A-Za-z0-9]/.test(before)) continue;
			if (text.includes(' ') && WORDS.test(text) && !CODEY.test(text) && !CLASSES(text))
				found.push(text);
		}
	}
	return found;
}

/**
 * A table of words, keyed by something the app already knows.
 *
 * `HORIZON_LABELS: Record<Horizon, string> = { day: 'Day', … }` is a screen's
 * vocabulary sitting in a shape none of the rules above look at: the property
 * is `day`, not `label`, so naming the properties that carry copy misses it
 * entirely. What gives it away is the type — a `Record` of strings is a lookup,
 * and a lookup of sentences is copy.
 *
 * Typed as `Record<X, PlainKey>` once converted, so this stops matching it.
 */
function wordTables(source) {
	const found = [];

	for (const match of source.matchAll(/Record<[^>]*,\s*string>\s*=\s*\{/g)) {
		// Brace-matched, not matched to the next `};`: a regex that guesses the
		// end of the object runs past it and reads the rest of the file.
		let depth = 0;
		let end = -1;
		for (let i = match.index + match[0].length - 1; i < source.length; i++) {
			if (source[i] === '{') depth++;
			else if (source[i] === '}') {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		if (end < 0) continue;
		const body = source.slice(match.index + match[0].length, end);

		/*
		 * And only a table of plain entries.
		 *
		 * `const params: Record<string, string> = {}` filled in by code is not a
		 * vocabulary, and neither is one whose values are computed. Every line
		 * has to be `key: 'words'` or a comment, or this is not what it looks
		 * like.
		 */
		const lines = body
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		if (!lines.length) continue;
		const plain = lines.every(
			(line) =>
				/^\/[/*]|^\*/.test(line) ||
				/^'?[A-Za-z_$][\w$]*'?:\s*'(?:[^'\\]|\\.)*',?$/.test(line) ||
				// the two lines a nested row adds: `newest: {` and `},`
				/^'?[A-Za-z_$][\w$]*'?:\s*\{$/.test(line) ||
				/^\},?$/.test(line)
		);
		if (!plain) continue;

		for (const value of body.matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)) {
			const text = value[1].trim();
			if (text && WORDS.test(text) && !LOOKS_LIKE_A_KEY.test(text)) found.push(text);
		}
	}
	return found;
}

/**
 * The sentence a service refuses with.
 *
 * `throw new ValidationError('A day looks like 2026-09-01')` reaches a person:
 * it is what the form says back when they get it wrong. None of the rules above
 * see it — it is a bare string in a `.ts`, in no table and under no property
 * name — and it is copy as much as a heading is.
 *
 * These carry a message key now (`{ key: 'errors.…' }`), translated by the
 * adapter that turns the error into a response, so a quoted one here is a
 * file that has not been swept yet.
 *
 * `NotFoundError` is not among them: a string given to it is the *kind* of
 * thing that was not found — `'seat'`, `'workout category'` — which goes in the
 * log and never on screen, because saying which thing is missing is how that
 * error would leak what exists. One with something to say to a person takes a
 * key like the rest.
 */
const REFUSALS =
	/\b(?:Validation|Forbidden|Conflict|Unauthorized|PlanLimit|RateLimited)Error\(\s*'((?:[^'\\]|\\.){6,}?)'/g;

function refusals(source) {
	const found = [];
	for (const match of source.matchAll(REFUSALS)) {
		const text = match[1].trim();
		if (text && WORDS.test(text) && text.includes(' ')) found.push(text);
	}
	return found;
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
		// `help:` names a sentence in one list and an SVG path in the icon set —
		// `M12 4a8 8 0 1 0 …` is a drawing instruction, not words.
		if (!value || !WORDS.test(value)) continue;
		if (LOOKS_LIKE_A_KEY.test(value) || SVG_PATH.test(value)) continue;
		found.push(value);
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
		// A message key is not copy: a component that takes its label as a key
		// and translates it inside — `<RemindLead hint="tasks.plan.…">` — has
		// moved the words, not left them here. The property scan above already
		// knew this; the attribute one did not, so extracting a component with
		// a key-taking prop looked like copy arriving.
		if (LOOKS_LIKE_A_KEY.test(value)) continue;
		found.push(value);
	}

	/*
	 * Then the text, by removing the tags and keeping what is between them.
	 *
	 * Expressions go first and whole: `{t('a.b')}` is a message already, and
	 * `{count}` is a value — neither is a sentence somebody has to translate,
	 * and both would otherwise leave their innards behind as loose words.
	 */
	found.push(...wordTables(source));
	found.push(...refusals(source));
	found.push(...prosyLiterals(markup));

	for (const line of textRuns(markup)) {
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
