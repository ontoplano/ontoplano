/**
 * Which languages this app is written in.
 *
 * One list, read by the picker in settings, by the server deciding what to
 * render, by the mailer deciding what to send, by `yarn messages` deciding
 * which catalogues have to be complete, and by the Android resource folders.
 * Adding a language is adding a line here and a file in `messages/`.
 *
 * The tags are BCP 47 and they are what goes in `<html lang>`, what
 * `Intl.PluralRules` is given, and what an `Accept-Language` header is matched
 * against — so they are never invented. `pt-BR` rather than `pt` because the
 * translation is Brazilian and the differences are not cosmetic.
 */
export const LOCALES = ['en', 'pt-BR', 'de', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * The language the app is written in.
 *
 * Every other catalogue is checked against this one: a key it does not have is
 * a key nothing can render, and a key it has that another lacks is what
 * `yarn messages --check` fails on. English rather than Portuguese because the
 * repository is public and its contributors are not all Brazilian.
 */
export const SOURCE_LOCALE: Locale = 'en';

/**
 * What each language calls itself.
 *
 * In its own language, never translated. Somebody looking for their language
 * in a list is looking for the word they would write, and a person who has
 * ended up in a language they cannot read needs to find their way out of it —
 * which they cannot do if the list is written in the language they are lost in.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	'pt-BR': 'Português (Brasil)',
	de: 'Deutsch',
	es: 'Español'
};

export function isLocale(value: string | null | undefined): value is Locale {
	return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best of this app's languages for a browser that said what it wants.
 *
 * `Accept-Language` is a weighted list — `pt-BR,pt;q=0.9,en;q=0.8` — and it is
 * answered in the browser's order of preference, not in ours: the first entry
 * this app has is the answer. An exact tag wins over its base language, so a
 * browser asking for `pt-BR` gets Brazilian Portuguese rather than whatever
 * `pt` happens to resolve to, and one asking for plain `pt` still gets it
 * rather than falling through to English.
 *
 * Null when nothing matches, so the caller decides what "no answer" means —
 * for a request that is the instance's own default, which is not this module's
 * business to know.
 */
export function matchLocale(header: string | null | undefined): Locale | null {
	if (!header) return null;

	const wanted = header
		.split(',')
		.map((part) => {
			const [tag, ...rest] = part.trim().split(';');
			const q = rest.find((r) => r.trim().startsWith('q='));
			const weight = q ? Number(q.trim().slice(2)) : 1;
			/*
			 * A weight that is not a number is a header somebody built by hand,
			 * and dropping the language because its weight is malformed answers
			 * a browser that asked for English in Portuguese. Treated as "wanted
			 * most", which is what leaving the weight off means.
			 */
			return { tag: tag.trim(), q: Number.isNaN(weight) ? 1 : weight };
		})
		.filter((entry) => entry.tag)
		.sort((a, b) => b.q - a.q);

	for (const { tag } of wanted) {
		const exact = LOCALES.find((locale) => locale.toLowerCase() === tag.toLowerCase());
		if (exact) return exact;

		const base = tag.split('-')[0].toLowerCase();
		const byBase = LOCALES.find((locale) => locale.split('-')[0].toLowerCase() === base);
		if (byBase) return byBase;
	}

	return null;
}
