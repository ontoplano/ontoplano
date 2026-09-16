/**
 * Every word the app says, in the language the person reading it chose.
 *
 * How a string gets here: it goes in `messages/en.json` under a dotted key,
 * `yarn messages` turns the catalogues into the typed modules beside this one,
 * and the place that used to hold the literal asks for the key instead. The
 * key is checked by the compiler and the catalogues are checked against each
 * other, so a typo is a build error and a half-translated language is a failing
 * lint rather than an English sentence in the middle of a Portuguese screen.
 *
 * In a component:
 *
 *     const t = useT();
 *     <h1>{t('tasks.title')}</h1>
 *     <p>{t('tasks.count', { count })}</p>
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
import { getContext, setContext } from 'svelte';

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

const KEY = Symbol('ontoplano.t');

/**
 * Put the page's translator where every component under this one finds it.
 *
 * Takes a function rather than a translator, because context is set once and
 * the language is not fixed for the life of the tree: choosing a new one
 * re-runs the loads, and a translator captured at setup would go on speaking
 * the language the page was opened in. The getter closes over a `$derived`, so
 * every word re-renders when the answer changes.
 */
export function provideT(source: () => Translate): void {
	setContext(KEY, source);
}

/**
 * The translator for this component.
 *
 * Called once, at the top of a component's script, like any other context.
 * Outside a component — a `.ts` helper that builds a string — take a
 * `Translate` as an argument instead: a module that reaches for the current
 * language is a module that cannot be called from the server.
 */
export function useT(): Translate {
	const source = getContext<(() => Translate) | undefined>(KEY);
	if (!source) {
		throw new Error(
			'useT() outside a translated tree — the root layout provides it. A module that is ' +
				'not a component should take a Translate as an argument.'
		);
	}

	/*
	 * A stable function that asks again every time.
	 *
	 * Held for the life of the component like any other `const`, so a caller
	 * can keep it; reading through the getter on each call, so it says what the
	 * current language says rather than what it said at setup.
	 */
	const live = ((key: MessageKey, values?: MessageValues) =>
		(source() as (k: MessageKey, v?: MessageValues) => string)(key, values)) as Translate;

	Object.defineProperty(live, 'locale', { get: () => source().locale });
	return live;
}
