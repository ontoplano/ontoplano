import { resolve } from '$app/paths';

/**
 * Where a reminder leads.
 *
 * There is one kind now — a nudge before a block starts — so there is one
 * answer: the day that block is on. It used to be three, because a reminder
 * could also hang off a todo or off nothing at all, and the one hanging off
 * nothing had nowhere to lead. See `services/reminders.ts` for why that went.
 *
 * The rows from before still fire until they are dismissed, and they land here
 * too: the day the reminder was for is the best guess available, and it is a
 * better one than refusing to go anywhere.
 */
export function reminderHref(remindAt: string): string {
	return `${resolve('/planner/board')}?date=${remindAt.slice(0, 10)}`;
}
