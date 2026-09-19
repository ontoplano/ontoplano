import { resolve } from '$app/paths';
import { reminderLink, type ReminderRef } from '$lib/reminder-links';

/**
 * Where a reminder leads, as an address this browser can follow.
 *
 * Which route it is belongs to `$lib/reminder-links.ts`, shared with the
 * delivery job so the notification and the page cannot disagree. All this adds
 * is SvelteKit's own resolution of the path, which the job cannot do.
 */
export function reminderHref(reminder: ReminderRef): string {
	const link = reminderLink(reminder);
	return `${resolve(link.route)}${link.query}`;
}
