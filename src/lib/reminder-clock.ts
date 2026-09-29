/**
 * When a reminder may be set for, as a form can tell before sending it.
 *
 * The service refuses a time that has been and a time too close to ring
 * reliably; a form that let somebody fill in three fields and then handed
 * back an error about the first wasted their typing. So the same two rules
 * are asked here, of the account's own wall clock rather than the browser's —
 * a laptop in one zone setting a reminder for an account in another would
 * otherwise be told the wrong floor, in both directions.
 *
 * One module rather than a copy per form: the reminders page and the quick
 * add sheet both ask it, and `reminderClock()` in the reminders service is the
 * one place that reads the clock it is asked of.
 */

/** The account's clock as a form was handed it. */
export type ReminderClock = {
	/** Today, `YYYY-MM-DD`, in the account's zone. */
	today: string;
	/** Now to the minute, `YYYY-MM-DDTHH:mm`, in the account's zone. */
	now: string;
	/** The hour a day with no time goes off at, `HH:mm`. */
	dayStart: string;
	/** How far ahead of now the earliest reminder has to be. */
	leadMinutes: number;
};

/**
 * How far ahead the form suggests, when today's opening hour has gone.
 *
 * A quarter of an hour: long enough to still be ahead by the time somebody
 * has finished typing, short enough to mean "shortly".
 */
export const SOONEST_MINUTES = 15;

/**
 * The account's wall clock, `sinceMs` after it was read, plus `leadMinutes`.
 *
 * A form left sitting ages forward rather than offering a floor from an hour
 * ago. Arithmetic on the number, read as UTC because `now` is already the
 * account's wall clock — the Z only keeps the browser's own zone out of it.
 */
function aged(clock: ReminderClock, sinceMs: number, leadMinutes: number): string {
	const at = Date.parse(`${clock.now}:00Z`) + sinceMs + leadMinutes * 60_000;
	return new Date(at).toISOString().slice(0, 16);
}

/** The earliest a reminder may be set for, `sinceMs` after the clock was read. */
export function floorOf(clock: ReminderClock, sinceMs: number): string {
	return aged(clock, sinceMs, clock.leadMinutes);
}

/** A day and an optional time as the moment it means: no time is the day's start. */
function momentOf(clock: ReminderClock, day: string, time: string): string {
	return `${day}T${time || clock.dayStart}`;
}

/**
 * Whether a day and a time have already gone by. An empty time means the hour
 * the day starts — which can itself be behind: "today", left alone, at three
 * in the afternoon.
 */
export function hasBeen(clock: ReminderClock, sinceMs: number, day: string, time: string): boolean {
	if (!day) return false;
	return momentOf(clock, day, time) <= aged(clock, sinceMs, 0);
}

/** Whether a day and a time land inside the window the phone cannot cover. */
export function isTooSoon(
	clock: ReminderClock,
	sinceMs: number,
	day: string,
	time: string
): boolean {
	if (!day) return false;
	return momentOf(clock, day, time) < floorOf(clock, sinceMs);
}

/**
 * The next quarter hour, as the account's own clock reads it.
 *
 * Rounded up rather than added to the minute, because a suggestion that says
 * 15:07 is a number somebody has to think about; 15:15 is one they accept or
 * replace. The far end of the day rather than tomorrow: the day field says
 * which day, and moving it from under somebody is worse than a tight time.
 */
export function soonest(clock: ReminderClock, sinceMs: number): string {
	const [hour, minute] = aged(clock, sinceMs, 0).slice(11, 16).split(':').map(Number);
	const at = hour * 60 + minute + SOONEST_MINUTES;
	const rounded = Math.ceil(at / SOONEST_MINUTES) * SOONEST_MINUTES;
	if (rounded >= 24 * 60) return '23:59';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
}
