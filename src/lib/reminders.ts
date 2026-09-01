import { resolve } from '$app/paths';

/**
 * What a reminder is about, and therefore where it leads.
 *
 * Shared by the toast and the list, because "clicking it should go somewhere to
 * see it" has to give the same answer in both. A reminder attached to a block
 * leads to that day's board; one attached to a todo leads to the todo list; one
 * attached to nothing leads here, which is the page that exists so that a free
 * reminder is not a message with no home.
 */
export type ReminderSubject = 'instance' | 'todo' | 'free';

export function reminderHref(kind: ReminderSubject, remindAt: string): string {
	if (kind === 'instance') return `${resolve('/planner/board')}?date=${remindAt.slice(0, 10)}`;
	if (kind === 'todo') return resolve('/planner/todo');
	return resolve('/planner/reminders');
}
