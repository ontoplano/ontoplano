/**
 * The language, remembered by a device that has no server to ask.
 *
 * An instance running on the phone renders its first paint before the device's
 * database has opened — there is no server load to have decided, and the
 * account's setting is behind a worker that has not started. So the picker
 * writes the answer here as well, and the shell reads it. One device, one
 * person, one answer, which is what this storage is for.
 *
 * The served app never reads it: there the server has already resolved the
 * language from the account, the request and the instance, and a second copy
 * in the browser is a second thing to go stale.
 */
import { isLocale, matchLocale, type Locale } from './locales.js';

export const DEVICE_LOCALE_KEY = 'ontoplano.locale';

export function localeOnThisDevice(): Locale | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const stored = localStorage.getItem(DEVICE_LOCALE_KEY);
		return isLocale(stored) ? stored : null;
	} catch {
		// Storage turned off. The app still has a language, just not a
		// remembered one — and on a served instance the account's own setting
		// is the real answer anyway.
		return null;
	}
}

export function rememberLocaleOnThisDevice(locale: Locale): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(DEVICE_LOCALE_KEY, locale);
	} catch {
		/* see above */
	}
}

/**
 * What the device itself is set to, in its own order of preference.
 *
 * `navigator.languages` is the client-side spelling of `Accept-Language`, so
 * it is matched by the same function the server matches the header with — one
 * answer to "which of our languages did they ask for", however they asked.
 */
export function localeOfThisDevice(): Locale | null {
	if (typeof navigator === 'undefined') return null;
	const asked = navigator.languages?.length ? navigator.languages.join(',') : navigator.language;
	return matchLocale(asked);
}
