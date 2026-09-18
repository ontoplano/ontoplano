import type { Translate } from '$lib/i18n/core';

/**
 * A length of time, as somebody says it.
 *
 * "1h 30m", "45m", "2h" — never "90 minutes", which is a number to divide
 * rather than a length to feel. It lived in the board, and the review wants
 * the same three shapes for the same reason: two screens spelling a duration
 * differently is two screens that look like different apps.
 *
 * The translator is passed in rather than taken from context, so this can be
 * called from a `$derived` or a plain function as easily as from markup.
 */
export function formatDuration(t: Translate, minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return t('ui.minutesAbbrev', { count: rest });
	return rest === 0
		? t('ui.hoursAbbrev', { count: hours })
		: t('ui.hoursMinutesAbbrev', { hours, minutes: rest });
}
