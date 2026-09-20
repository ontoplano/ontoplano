/**
 * Turning a catalogue entry into a sentence.
 *
 * Two things a message needs that a plain string cannot do, and nothing else:
 * it can take values, and it can count. Everything past that — gender, ordinals,
 * nested selectors, a format language of its own — is a thing translators have
 * to learn and a thing this app has never needed. If it ever does, it belongs
 * here, once.
 */
import type { Locale } from './locales.js';

/**
 * A message is a string, or a string per plural category.
 *
 * `{ one: 'a task', other: '{count} tasks' }` — the categories are the ones
 * `Intl.PluralRules` gives for the language, so a translator writes the forms
 * their own language actually has. Portuguese and English both have `one` and
 * `other`; Polish would have `few` and `many`, and nothing here has to change
 * for it.
 */
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;

export type MessageValues = Record<string, string | number>;

/** `{name}` and nothing cleverer. A brace that is not a placeholder stays put. */
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

/**
 * Which plural form a count takes in a language.
 *
 * Cached because a `PluralRules` is not free to build and the same handful of
 * locales are asked over and over, once per counted message per render.
 */
const rules = new Map<Locale, Intl.PluralRules>();

function pluralRule(locale: Locale): Intl.PluralRules {
	let rule = rules.get(locale);
	if (!rule) {
		rule = new Intl.PluralRules(locale);
		rules.set(locale, rule);
	}
	return rule;
}

/**
 * Numbers are written the way the language writes them.
 *
 * 1,234 in English and 1.234 in Portuguese. Interpolating a raw `toString()`
 * is the quiet way to leave half a translation in English, so a number handed
 * to a message is formatted rather than concatenated — which also means a
 * translator never has to think about separators.
 */
/**
 * Placeholders that name something rather than count it.
 *
 * Everything else that arrives as a number is a quantity and is grouped for
 * the reader — "5.000 notas". These are labels: they are written out as their
 * digits, whatever the language does to numbers.
 */
const LABELS = new Set(['year']);

const numbers = new Map<Locale, Intl.NumberFormat>();

function numberFormat(locale: Locale): Intl.NumberFormat {
	let format = numbers.get(locale);
	if (!format) {
		format = new Intl.NumberFormat(locale);
		numbers.set(locale, format);
	}
	return format;
}

/**
 * The message, with its values in it.
 *
 * A counted message picks its form from `values.count` — the name is fixed,
 * because a plural that could key off any value is a plural a translator has
 * to be told about. `{count}` inside the chosen form is the number itself, so
 * "one task" and "7 tasks" are the same message.
 *
 * A placeholder with no value is left as it was written rather than replaced
 * with "undefined": a visible `{name}` is a bug somebody reports, and the word
 * undefined in the middle of a sentence is a bug somebody screenshots.
 */
export function format(message: Message, locale: Locale, values?: MessageValues): string {
	let text: string | undefined;

	if (typeof message === 'string') {
		text = message;
	} else {
		const count = values?.count;
		const category =
			typeof count === 'number' ? pluralRule(locale).select(count) : ('other' as const);
		text = message[category] ?? message.other ?? Object.values(message)[0];
	}

	if (text === undefined) return '';
	if (!values) return text;

	return text.replace(PLACEHOLDER, (whole, name: string) => {
		const value = values[name];
		if (value === undefined) return whole;
		if (typeof value !== 'number') return value;
		// A year is a name for a year, not a count of them. Grouped like a
		// quantity it came out as "Week of Aug 24 2,026", which reads as two
		// thousand and twenty-six of something. Decided by the placeholder's
		// name rather than left to each caller to remember a `String()`, since
		// forgetting it looks fine in English-with-small-numbers and wrong
		// everywhere else.
		if (LABELS.has(name)) return String(value);
		return numberFormat(locale).format(value);
	});
}

/**
 * The names a message asks for, so a check can compare two languages.
 *
 * A translation that drops `{count}` renders a sentence with a hole in it and
 * nothing notices, because it is still a valid string. `yarn messages --check`
 * compares this between every catalogue and the source.
 */
export function placeholdersIn(message: Message): string[] {
	const texts = typeof message === 'string' ? [message] : Object.values(message);
	const found = new Set<string>();
	for (const text of texts) {
		for (const match of (text ?? '').matchAll(PLACEHOLDER)) found.add(match[1]);
	}
	return [...found].sort();
}
