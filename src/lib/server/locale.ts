/**
 * Which language a request is answered in, and which one a person is written to in.
 *
 * Two different questions, and conflating them is the classic bug: a reminder
 * written while its recipient is asleep has no request and no `Accept-Language`
 * to read, and the language of whoever *triggered* the send — a webhook, a
 * cron, an assistant — has nothing to do with the language of whoever opens
 * the mail. So they are two functions, and the one for mail never looks at a
 * request.
 */
import type { RequestEvent } from '@sveltejs/kit';

import { getLocale } from '$lib/services/settings.js';
import { matchLocale, type Locale } from '$lib/i18n/locales.js';
import { loadConfig } from './config.js';

/** What this instance answers in when nothing else has said. */
export function instanceLocale(): Locale {
	return loadConfig().instance.language;
}

/**
 * The language to render this request in.
 *
 * In order: what the account chose, what the browser asked for, what the
 * instance falls back to. The account comes first even against an explicit
 * `Accept-Language`, because somebody who went into settings and chose a
 * language meant it — including on a borrowed machine whose browser is set to
 * something else.
 */
export function localeForRequest(event: RequestEvent): Locale {
	if (event.locals.user) {
		const chosen = getLocale(event.locals.user.id);
		if (chosen) return chosen;
	}
	return matchLocale(event.request.headers.get('accept-language')) ?? instanceLocale();
}

/**
 * The language to write to somebody in.
 *
 * Their own choice, or the instance's. Never a request's header: mail is sent
 * from jobs and webhooks as often as from a page, and a header that happens to
 * be in scope is a header from the wrong person.
 */
export function localeForUser(userId: string): Locale {
	return getLocale(userId) ?? instanceLocale();
}
