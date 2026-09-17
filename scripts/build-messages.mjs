#!/usr/bin/env node
/**
 * The message catalogues, turned into modules the app can import.
 *
 *   yarn messages            write src/lib/i18n/{keys,load,catalogues}
 *   yarn messages --check    fail if they are stale or a language is behind
 *
 * `messages/<locale>.json` is what a person edits: dotted keys, one file per
 * language, sorted. Everything under `src/lib/i18n/catalogues/` is written
 * from it and should never be edited, for the same reason `mark-shape.ts`
 * should not be — the next run overwrites it.
 *
 * What generating buys, rather than importing the JSON directly:
 *
 *   A key that does not exist is a type error instead of a blank on a screen,
 *   because the union of keys comes from the source catalogue.
 *
 *   A message that takes values cannot be called without them, and one that
 *   counts gets its `count` typed as a number, because the values each key
 *   needs are read out of its own placeholders.
 *
 *   One language ships to one reader. The catalogues are separate modules
 *   behind a dynamic import, so a Portuguese reader downloads Portuguese and
 *   not both.
 *
 * And what --check refuses, which is the part that keeps "everything is
 * translatable" true after the day somebody writes it down:
 *
 *   a key in one language and not another — a hole nothing renders;
 *   a placeholder in one language and not another — a sentence with a gap in
 *   it, which is still a valid string and so passes every other check;
 *   a plural form the language does not have, which is a translator being
 *   told the wrong thing about their own grammar.
 *
 * What it allows, deliberately: `null`. A key that is present and null is one
 * nobody has translated yet. It ships as the source language's own words, so
 * the screen is readable rather than full of keys, and it is counted — the
 * language section in settings says how many are still English, and
 * `yarn messages` prints it. This is what lets somebody add an English string
 * without speaking Portuguese, and a translator find the work without reading
 * a diff.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'messages');
const OUT = join(ROOT, 'src/lib/i18n');
const CHECK = process.argv.includes('--check');

/*
 * The languages, read from the module the app reads them from.
 *
 * Parsed rather than imported because it is TypeScript and node does not speak
 * it — the same bargain `build-icons.mjs` makes with `brand.ts`. One list, and
 * a language added to it with no catalogue beside it is an error here rather
 * than a blank screen later.
 */
const localesFile = join(OUT, 'locales.ts');
const localesSource = readFileSync(localesFile, 'utf8');
const LOCALES = (localesSource.match(/export const LOCALES = \[([^\]]+)\]/)?.[1] ?? '')
	.split(',')
	.map((entry) => entry.trim().replace(/^'|'$/g, ''))
	.filter(Boolean);
const SOURCE_LOCALE = localesSource.match(/export const SOURCE_LOCALE: Locale = '([^']+)'/)?.[1];

if (!LOCALES.length || !SOURCE_LOCALE) {
	console.error(`${relative(ROOT, localesFile)} no longer declares LOCALES and SOURCE_LOCALE`);
	process.exit(1);
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
/** The plural categories a language actually has, asked of the platform. */
const categoriesOf = (locale) =>
	new Set([...new Intl.PluralRules(locale).resolvedOptions().pluralCategories, 'other']);

const problems = [];

function read(locale) {
	const file = join(SOURCE, `${locale}.json`);
	if (!existsSync(file)) {
		problems.push(`messages/${locale}.json does not exist — every language needs a catalogue.`);
		return {};
	}
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (error) {
		problems.push(`messages/${locale}.json is not valid JSON: ${error.message}`);
		return {};
	}
}

const catalogues = Object.fromEntries(LOCALES.map((locale) => [locale, read(locale)]));
const source = catalogues[SOURCE_LOCALE];
const keys = Object.keys(source).sort();

for (const key of keys) {
	if (source[key] === null) {
		problems.push(
			`messages/${SOURCE_LOCALE}.json: ${key} is null. The source language is what every ` +
				'other one falls back to, so it is the one place a message has to exist.'
		);
	}
}

/** Every placeholder a message asks for, whichever plural form it is in. */
function placeholders(message) {
	const texts = typeof message === 'string' ? [message] : Object.values(message ?? {});
	const found = new Set();
	for (const text of texts) {
		for (const match of String(text ?? '').matchAll(PLACEHOLDER)) found.add(match[1]);
	}
	return [...found].sort();
}

// A stray file in messages/ is a language somebody started and never declared.
for (const file of existsSync(SOURCE) ? readdirSync(SOURCE) : []) {
	// A dotfile here is bookkeeping, not a language — the copy ratchet keeps
	// its floor beside the catalogues it is counting against.
	if (!file.endsWith('.json') || file.startsWith('.')) continue;
	const locale = file.slice(0, -'.json'.length);
	if (!LOCALES.includes(locale)) {
		problems.push(
			`messages/${file} is not a language this app has. Add '${locale}' to LOCALES in ` +
				`src/lib/i18n/locales.ts, or delete the file.`
		);
	}
}

for (const locale of LOCALES) {
	const catalogue = catalogues[locale];
	const categories = categoriesOf(locale);

	if (locale !== SOURCE_LOCALE) {
		// `null` counts as present: the key exists, the words do not yet.
		const missing = keys.filter((key) => !(key in catalogue));
		const extra = Object.keys(catalogue).filter((key) => !(key in source));

		if (missing.length) {
			problems.push(
				`messages/${locale}.json is missing ${missing.length} message(s) that ` +
					`${SOURCE_LOCALE} has: ${missing.slice(0, 6).join(', ')}` +
					(missing.length > 6 ? ', …' : '')
			);
		}
		if (extra.length) {
			problems.push(
				`messages/${locale}.json has ${extra.length} message(s) ${SOURCE_LOCALE} does not: ` +
					`${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ', …' : ''}`
			);
		}
	}

	for (const [key, message] of Object.entries(catalogue)) {
		if (message === null || typeof message === 'string') continue;

		if (typeof message !== 'object' || Array.isArray(message)) {
			problems.push(
				`messages/${locale}.json: ${key} is neither a sentence nor a set of plural forms.`
			);
			continue;
		}
		for (const form of Object.keys(message)) {
			if (!categories.has(form)) {
				problems.push(
					`messages/${locale}.json: ${key} has a "${form}" form, which ${locale} does not ` +
						`have. It has: ${[...categories].join(', ')}.`
				);
			}
		}
		if (!('other' in message)) {
			problems.push(`messages/${locale}.json: ${key} has plural forms but no "other" one.`);
		}
	}

	if (locale === SOURCE_LOCALE) continue;

	for (const key of keys) {
		if (!(key in catalogue) || catalogue[key] === null) continue;
		const want = placeholders(source[key]).join(',');
		const got = placeholders(catalogue[key]).join(',');
		if (want !== got) {
			problems.push(
				`messages/${locale}.json: ${key} uses {${got || 'nothing'}} where ${SOURCE_LOCALE} ` +
					`uses {${want || 'nothing'}} — one of the two renders with a hole in it.`
			);
		}
	}
}

if (problems.length) {
	console.error('messages:');
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}

// ── Writing ──────────────────────────────────────────────────────────────────

let stale = 0;

/*
 * Written the way the repository writes TypeScript.
 *
 * Generated or not, these files sit in `src/` and `yarn lint` reads them like
 * any other — so they are handed to prettier here rather than added to an
 * ignore list, which is the version of this that ends with generated code
 * nobody's formatter has an opinion about.
 */
const prettierOptions = await prettier.resolveConfig(join(ROOT, 'src/lib/i18n/index.ts'));

const write = async (path, source) => {
	const full = join(ROOT, path);
	mkdirSync(dirname(full), { recursive: true });
	const content = await prettier.format(source, { ...prettierOptions, filepath: full });
	const before = existsSync(full) ? readFileSync(full, 'utf8') : null;
	if (before === content) return;
	stale++;
	if (CHECK) {
		console.log(`  stale  ${path}`);
		return;
	}
	writeFileSync(full, content);
	console.log(`  wrote  ${path}`);
};

const banner = (what) =>
	`/* Generated by scripts/build-messages.mjs from ${what}. Do not edit — run \`yarn messages\`. */`;

/*
 * What each key needs handed to it.
 *
 * `count` is a number because it is what picks the plural form and because a
 * string would be formatted by the wrong half of `Intl`. Everything else may
 * be either: a name is a string, an amount is a number and wants the language's
 * own separators, and the message does not care which it was given.
 */
const valuesFor = new Map();
for (const key of keys) {
	const names = placeholders(source[key]);
	if (!names.length) continue;
	valuesFor.set(
		key,
		names.map((name) => `${name}: ${name === 'count' ? 'number' : 'string | number'}`)
	);
}

const quoted = (key) => `'${key.replace(/'/g, "\\'")}'`;

await write(
	'src/lib/i18n/keys.ts',
	[
		banner(`messages/${SOURCE_LOCALE}.json`),
		'',
		'/** Every message this app has. A key not in here does not exist. */',
		`export type MessageKey =${keys.length ? '\n' + keys.map((k) => `\t| ${quoted(k)}`).join('\n') : ' never'};`,
		'',
		'/**',
		' * The keys that take values, and which values.',
		' *',
		' * Read out of the placeholders in the source catalogue, so a message that',
		' * gains a `{name}` makes every call site that does not pass one a type error',
		' * rather than a sentence with a brace in it.',
		' */',
		'export interface MessageValuesFor {',
		...[...valuesFor].map(([key, fields]) => `\t${quoted(key)}: { ${fields.join('; ')} };`),
		'}',
		'',
		'/** A message that takes values — it may not be called without them. */',
		'export type KeyWithValues = keyof MessageValuesFor;',
		'',
		'/** A message that takes none. */',
		'export type PlainKey = Exclude<MessageKey, KeyWithValues>;',
		''
	].join('\n')
);

/** How many messages each language is still borrowing from the source. */
const borrowed = {};

for (const locale of LOCALES) {
	const catalogue = catalogues[locale];
	const untranslated = keys.filter((key) => catalogue[key] === null || !(key in catalogue));
	borrowed[locale] = untranslated.length;

	/*
	 * An untranslated message ships as the source language's own words.
	 *
	 * Not as the key, and not by loading a second catalogue at runtime: the
	 * screen stays readable, and a Portuguese reader still downloads exactly
	 * one catalogue. The count above is what the app says about it out loud.
	 */
	const entries = keys.map(
		(key) =>
			`\t${quoted(key)}: ${JSON.stringify(catalogue[key] === null || !(key in catalogue) ? source[key] : catalogue[key])}`
	);
	await write(
		`src/lib/i18n/catalogues/${locale}.ts`,
		[
			banner(`messages/${locale}.json`),
			'',
			"import type { Catalogue } from '../core.js';",
			'',
			`export const messages: Catalogue = {`,
			entries.join(',\n'),
			'};',
			''
		].join('\n')
	);
}

await write(
	'src/lib/i18n/coverage.ts',
	[
		banner('the catalogues in messages/'),
		'',
		'/**',
		' * How many messages a language has not been written in yet.',
		' *',
		' * Those render in the source language rather than as keys, which is',
		' * readable and also invisible — so the number is here, and the language',
		' * section in settings says it beside the language it belongs to. Zero is a',
		' * language somebody has finished.',
		' */',
		"import type { Locale } from './locales.js';",
		'',
		'const UNTRANSLATED: Record<Locale, number> = {',
		...LOCALES.map((locale) => `\t'${locale}': ${borrowed[locale]},`),
		'};',
		'',
		'export function untranslatedCount(locale: Locale): number {',
		'\treturn UNTRANSLATED[locale] ?? 0;',
		'}',
		''
	].join('\n')
);

await write(
	'src/lib/i18n/load.ts',
	[
		banner('the list of languages in locales.ts'),
		'',
		'/**',
		' * One language, fetched when it is the one being read.',
		' *',
		' * Written out as a switch rather than built from the locale, because a',
		' * bundler can only split what it can see: an import with a variable in it',
		' * either fails or drags every language into one chunk.',
		' */',
		"import type { Catalogue } from './core.js';",
		"import type { Locale } from './locales.js';",
		'',
		'export async function loadCatalogue(locale: Locale): Promise<Catalogue> {',
		'\tswitch (locale) {',
		...LOCALES.filter((locale) => locale !== SOURCE_LOCALE).flatMap((locale) => [
			`\t\tcase '${locale}':`,
			`\t\t\treturn (await import('./catalogues/${locale}.js')).messages;`
		]),
		'\t\tdefault:',
		`\t\t\treturn (await import('./catalogues/${SOURCE_LOCALE}.js')).messages;`,
		'\t}',
		'}',
		''
	].join('\n')
);

if (CHECK && stale) {
	console.error(`\n${stale} generated message file(s) out of date. Run: yarn messages`);
	process.exit(1);
}

const behind = LOCALES.filter((locale) => borrowed[locale] > 0)
	.map((locale) => `${locale} is ${borrowed[locale]} behind`)
	.join(', ');

console.log(
	`\n${keys.length} messages, ${LOCALES.length} languages` +
		(behind ? ` — ${behind}.` : '.') +
		(stale ? '' : ' Already up to date.')
);
