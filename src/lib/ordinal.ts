import type { Translate } from './i18n/core.js';

/**
 * "1st", "2nd", "1º", "1." — a position, written the way a language writes one.
 *
 * `Intl.PluralRules` in ordinal mode says which form a number takes: English
 * has four and most languages have one, and the ending for each is a message
 * like any other rather than a table in here. Built from the translator's own
 * locale, so it follows the language the reader chose rather than the one the
 * server happens to be in.
 */
const ENDINGS = {
	one: 'ordinal.one',
	two: 'ordinal.two',
	few: 'ordinal.few',
	other: 'ordinal.other'
} as const;

/** Cached: a `PluralRules` is not free, and this is asked once per render. */
const rules = new Map<string, Intl.PluralRules>();

export function ordinal(t: Translate, n: number): string {
	let rule = rules.get(t.locale);
	if (!rule) {
		rule = new Intl.PluralRules(t.locale, { type: 'ordinal' });
		rules.set(t.locale, rule);
	}
	const form = rule.select(n) as keyof typeof ENDINGS;
	return `${n}${t(ENDINGS[form] ?? ENDINGS.other)}`;
}
