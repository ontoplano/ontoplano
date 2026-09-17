/**
 * On an isolated instance nothing renders on a server, because there is none:
 * every page is client-rendered over the device's own database. Everywhere
 * else this file changes nothing.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

import { loadBorrowed, loadCatalogue } from '$lib/i18n';
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
	/*
	 * A build that is not the real one also fetches what is still English, so
	 * the shell can paint it. `dev` is `make dev`; the staging flag comes from
	 * the server. Production asks for neither, so neither is in its bundle.
	 */
	const marking = dev || data?.staging === true;

	return {
		...data,
		locale,
		catalogue: await loadCatalogue(locale),
		borrowed: marking ? await loadBorrowed(locale) : undefined
	};
};
