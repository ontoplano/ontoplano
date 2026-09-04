/**
 * The task vocabulary, shared by server and client.
 *
 * `status` is what state a task is in — these are the board columns. There
 * used to be a `timing` beside it — early, on time, late, stamped when a task
 * was ticked — and it was dropped whole: ticking a day off at bedtime marked
 * everything late, the correction was a chore nobody did, and nothing ever
 * read the answer back.
 */
export const STATUSES = ['todo', 'doing', 'done', 'skipped'] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses that mean the task is no longer waiting to be done. */
export const CLOSED_STATUSES: readonly Status[] = ['done', 'skipped'];

export function isStatus(value: unknown): value is Status {
	return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export const STATUS_LABELS: Record<Status, string> = {
	// "Pending" rather than "To do": the column beside it is the Todo list, and
	// two columns a word apart meaning different things is a puzzle. This is the
	// state a task is in; that is where tasks with no day live.
	todo: 'Pending',
	doing: 'Doing',
	done: 'Done',
	skipped: 'Skipped'
};
