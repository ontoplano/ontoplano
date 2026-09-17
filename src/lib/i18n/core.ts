/**
 * Every word the app says, in the language the person reading it chose.
 *
 * This half knows nothing about Svelte, and that is the point: the mailer, the
 * reminder job and the weekly review all translate, and they run on a box where
 * `yarn install --production` has not installed a UI framework. `index.ts`
 * beside this adds the two helpers a component needs and re-exports the rest,
 * so a component imports `$lib/i18n` and everything else imports `$lib/i18n/core`.
 *
 * How a string gets here: it goes in `messages/en.json` under a dotted key,
 * `yarn messages` turns the catalogues into the typed modules beside this one,
 * and the place that used to hold the literal asks for the key instead. The
 * key is checked by the compiler and the catalogues are checked against each
 * other, so a typo is a build error and a half-translated language is a failing
 * lint rather than an English sentence in the middle of a Portuguese screen.
 *
 * On the server, where there is no component and the language belongs to
 * whoever is being written to rather than to whoever asked:
 *
 *     const t = await translatorFor(recipientLocale);
 *
 * The locale is never module state. A server renders for many people at once
 * and a module-level "current language" is one request's answer leaking into
 * another's page — so it arrives through context in the browser and through an
 * argument everywhere else.
 */
import { format, type Message, type MessageValues } from './format.js';
import { loadCatalogue } from './load.js';
import type { KeyWithValues, MessageKey, MessageValuesFor, PlainKey } from './keys.js';
import type { Locale } from './locales.js';

export type { Locale, MessageKey, MessageValues };
export { LOCALES, LOCALE_NAMES, SOURCE_LOCALE, isLocale, matchLocale } from './locales.js';
export { loadCatalogue };

export type Catalogue = Partial<Record<MessageKey, Message>>;

/**
 * Ask for a message by key.
 *
 * Two signatures, both generated from the source catalogue: a message with no
 * placeholders takes nothing, and one with placeholders takes exactly its own.
 * Adding a `{name}` to a sentence therefore breaks every call site that does
 * not pass one, which is the only moment anybody would ever look for them.
 */
export interface Translate {
	(key: PlainKey): string;
	<K extends KeyWithValues>(key: K, values: MessageValuesFor[K]): string;
	/** Which language this one speaks — for `<html lang>` and for `Intl`. */
	readonly locale: Locale;
}

/**
 * A translator over one catalogue.
 *
 * A key the catalogue does not have renders as the key itself. Not the English
 * for it: falling back would mean shipping the source language alongside every
 * other one, doubling what a Portuguese reader downloads to guard against a
 * thing `yarn messages --check` already refuses to let through. A visible
 * `tasks.title` is a bug report; a silently English sentence is not.
 */
export function translator(locale: Locale, catalogue: Catalogue): Translate {
	const translate = ((key: MessageKey, values?: MessageValues) => {
		const message = catalogue[key];
		if (message === undefined) return key;
		return format(message, locale, values);
	}) as { (key: MessageKey, values?: MessageValues): string; locale: Locale };

	translate.locale = locale;
	return translate as Translate;
}

/** The same, for a caller that has a locale and not a catalogue — the server. */
export async function translatorFor(locale: Locale): Promise<Translate> {
	return translator(locale, await loadCatalogue(locale));
}
