import { resolve } from '$app/paths';

/**
 * Where a reminder leads.
 *
 * A nudge before a block leads to the day that block is on; a birthday leads to
 * the person whose it is. Every kind leads somewhere, which is the rule that
 * killed the third one: a reminder that hangs off nothing has nowhere to go,
 * and a notification you cannot follow is one you have to remember twice — once
 * because it told you, and again because seeing the thing it is about means
 * going and finding it. See `services/reminders.ts`.
 *
 * The rows from before still fire until they are dismissed, and they land on
 * the day they were for: the best guess available, and a better one than
 * refusing to go anywhere.
 */
export function reminderHref(reminder: {
	remindAt: string;
	subjectKind?: string | null;
	subjectId?: number | null;
}): string {
	if (reminder.subjectKind === 'person' && reminder.subjectId) {
		return `${resolve('/diary/people')}?person=${reminder.subjectId}`;
	}
	return `${resolve('/planner/board')}?date=${reminder.remindAt.slice(0, 10)}`;
}
