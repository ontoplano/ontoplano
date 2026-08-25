/**
 * The task vocabulary, shared by server and client.
 *
 * `status` is what state a task is in — these are the board columns. `timing`
 * is a fact about a finished task, not a state of its own: "delayed" and
 * "early" used to be statuses, but both mean *done*, which is why there was
 * nothing for a kanban column to map onto.
 */
export const STATUSES = ['todo', 'doing', 'done', 'skipped'] as const;
export type Status = (typeof STATUSES)[number];

export const TIMINGS = ['early', 'on_time', 'late'] as const;
export type Timing = (typeof TIMINGS)[number];

/** Statuses that mean the task is no longer waiting to be done. */
export const CLOSED_STATUSES: readonly Status[] = ['done', 'skipped'];

export function isStatus(value: unknown): value is Status {
	return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function isTiming(value: unknown): value is Timing {
	return typeof value === 'string' && (TIMINGS as readonly string[]).includes(value);
}

export const STATUS_LABELS: Record<Status, string> = {
	todo: 'To do',
	doing: 'Doing',
	done: 'Done',
	skipped: 'Skipped'
};

export const TIMING_LABELS: Record<Timing, string> = {
	early: 'early',
	on_time: 'on time',
	late: 'late'
};

/**
 * Was a task finished before, on, or after the time it was planned for?
 *
 * A generous window either side, because nobody starts a thing at exactly the
 * minute they wrote down and calling that "late" would make the whole signal
 * noise. Only meaningful for `done`.
 */
export const TIMING_GRACE_MINUTES = 15;

export function timingFor(
	scheduledAt: string,
	completedAt: string,
	plannedInstant?: number
): Timing {
	// `scheduledAt` is a wall-clock time, `completedAt` an instant. The caller
	// resolves the first against the user's zone and passes it in; without that
	// the two are only comparable for someone in the server's zone.
	const planned = plannedInstant ?? new Date(scheduledAt).getTime();
	const actual = new Date(completedAt).getTime();
	if (!Number.isFinite(planned) || !Number.isFinite(actual)) return 'on_time';

	const deltaMinutes = (actual - planned) / 60_000;
	if (deltaMinutes < -TIMING_GRACE_MINUTES) return 'early';
	if (deltaMinutes > TIMING_GRACE_MINUTES) return 'late';
	return 'on_time';
}
