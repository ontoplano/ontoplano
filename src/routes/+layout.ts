/**
 * On an isolated instance nothing renders on a server, because there is none:
 * every page is client-rendered over the device's own database. Everywhere
 * else this file changes nothing.
 */
import { env } from '$env/dynamic/public';

import { loadCatalogue } from '$lib/i18n';
import { SOURCE_LOCALE, isLocale, type Locale } from '$lib/i18n/locales';
import { localeOfThisDevice, localeOnThisDevice } from '$lib/i18n/device';
import type { LayoutLoad } from './$types';

export const ssr = env.PUBLIC_ONTOPLANO_ISOLATED !== 'true';

/**
 * The language's words, fetched once for the whole shell.
 *
 * Here rather than in the server load because an instance running on the
 * device has no server load to run. Everywhere else the server has already
 * decided — from the account's setting, then the request's header, then the
 * instance's own fallback — and this only turns its answer into the words.
 *
 * One language is fetched, not all of them: `loadCatalogue` is a switch of
 * static imports, so the bundler splits them and a Portuguese reader downloads
 * Portuguese.
 */
export const load: LayoutLoad = async ({ data }) => {
	const locale: Locale = isLocale(data?.locale)
		? data.locale
		: (localeOnThisDevice() ?? localeOfThisDevice() ?? SOURCE_LOCALE);

	// Spread: a universal load's return IS the page's data, so anything the
	// server load produced has to be carried through rather than replaced.
	return { ...data, locale, catalogue: await loadCatalogue(locale) };
};
