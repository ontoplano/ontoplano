/**
 * How a moment is written down, in one place.
 *
 * Every screen used to call `toLocaleTimeString` or `toLocaleDateString` with
 * its own options, which meant thirty-seven small decisions about the same
 * question and no way to answer it once. The visible symptom was the clock:
 * some screens said `16:00` because they passed `hour12: false`, others said
 * `4 PM` because they passed nothing and let the locale decide, and nobody
 * could choose.
 *
 * So: one module, three questions.
 *
 * **Which clock.** `auto` asks the language what it does — English says four
 * in the afternoon, Portuguese and German say sixteen — and `12`/`24` are a
 * person overruling that for their own account. The default is `auto` because
 * the language is right far more often than not, and it is a *setting* because
 * "far more often than not" is not always.
 *
 * **Which zone.** Always the account's, never the machine's. A phone in
 * another country should still show the day you planned.
 *
 * **Which shape.** Named shapes rather than options objects, so that "the time
 * of day" looks the same everywhere it appears and changing what that means is
 * one edit. A caller that needs something genuinely one-off passes `extra`,
 * and that stays visible as the exception it is.
 */
import type { Locale } from '$lib/i18n/locales';

/** What a person can choose. `auto` defers to the language. */
export const CLOCKS = ['auto', '12', '24'] as const;
export type Clock = (typeof CLOCKS)[number];

export function isClock(value: unknown): value is Clock {
	return typeof value === 'string' && (CLOCKS as readonly string[]).includes(value);
}

/** How the app is being read: the language, the zone, and the chosen clock. */
export type When = {
	locale: Locale;
	/** An IANA zone. The account's, not the machine's. */
	tz: string;
	clock: Clock;
};

/**
 * `hour12` for `Intl`, or undefined to let the language decide.
 *
 * Undefined rather than a computed boolean on `auto`: asking `Intl` what the
 * language does and then telling it the answer is a way to be subtly wrong
 * about a locale whose answer is neither — `hourCycle` has four values and
 * `hour12` has two.
 */
function hour12Of(clock: Clock): boolean | undefined {
	if (clock === '12') return true;
	if (clock === '24') return false;
	return undefined;
}

/** Whatever a caller has: an instant, a naive wall-clock string, or a date. */
export type Moment = Date | string | number;

/**
 * A `Date` from any of the shapes a caller has.
 *
 * A naive `YYYY-MM-DDTHH:MM` has no zone on it and means a wall-clock time —
 * see `$lib/services/time`. Read as-is it would be treated as UTC and shift by
 * the offset, which is the bug that made "Gym at 18:00" show as 15:00 in
 * São Paulo. Here it is read as already being in the account's zone, so the
 * formatter must not shift it again: `naive` says so.
 */
function parse(moment: Moment): { at: Date; naive: boolean } {
	if (moment instanceof Date) return { at: moment, naive: false };
	if (typeof moment === 'number') return { at: new Date(moment), naive: false };

	const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(moment);
	if (hasZone) return { at: new Date(moment), naive: false };

	// A bare date, or a date and a time, written in the reader's own zone.
	const padded = moment.length === 10 ? `${moment}T00:00:00` : moment;
	return { at: new Date(`${padded}Z`), naive: true };
}

function formatWith(moment: Moment, when: When, options: Intl.DateTimeFormatOptions): string {
	const { at, naive } = parse(moment);
	if (Number.isNaN(at.getTime())) return '';
	return new Intl.DateTimeFormat(when.locale, {
		// A naive value is already in the reader's zone; shifting it again is
		// the whole bug this distinction exists to prevent.
		timeZone: naive ? 'UTC' : when.tz,
		...options
	}).format(at);
}

/** The time of day: `16:00`, or `4:00 PM` where that is what the clock means. */
export function timeOf(moment: Moment, when: When, extra: Intl.DateTimeFormatOptions = {}): string {
	return formatWith(moment, when, {
		hour: 'numeric',
		minute: '2-digit',
		hour12: hour12Of(when.clock),
		...extra
	});
}

/** A day, the short way: `10 Sep`, `Sep 10`, `10 de set.` — the language decides. */
export function dayOf(moment: Moment, when: When, extra: Intl.DateTimeFormatOptions = {}): string {
	return formatWith(moment, when, { day: 'numeric', month: 'short', ...extra });
}

/** A day with its year, for anything that can be more than a year old. */
export function dateOf(moment: Moment, when: When, extra: Intl.DateTimeFormatOptions = {}): string {
	return formatWith(moment, when, { day: 'numeric', month: 'short', year: 'numeric', ...extra });
}

/** A day and a time together, for a log or a receipt. */
export function momentOf(
	moment: Moment,
	when: When,
	extra: Intl.DateTimeFormatOptions = {}
): string {
	return formatWith(moment, when, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: hour12Of(when.clock),
		...extra
	});
}

/**
 * The name of a month, from a `YYYY-MM` key.
 *
 * Charts and ledgers are grouped by month key, and each of them was building
 * `${key}-15T12:00:00Z` by hand to get a name out of it — the fifteenth at
 * noon UTC, far enough from both edges that no zone can push it into a
 * neighbouring month. Worth having once rather than four times, and worth
 * saying why: the date is arbitrary and the month is the whole point.
 */
export function monthOf(key: string, when: When, extra: Intl.DateTimeFormatOptions = {}): string {
	const at = new Date(`${key}-15T12:00:00Z`);
	if (Number.isNaN(at.getTime())) return '';
	return new Intl.DateTimeFormat(when.locale, { month: 'short', timeZone: 'UTC', ...extra }).format(
		at
	);
}

/** The weekday alone, for a planner column or a habit grid. */
export function weekdayOf(
	moment: Moment,
	when: When,
	extra: Intl.DateTimeFormatOptions = {}
): string {
	return formatWith(moment, when, { weekday: 'short', ...extra });
}

/**
 * `HH:mm` or `h:mm a` as a *pattern*, for the things that are not `Intl`.
 *
 * The planner grid is FullCalendar and takes its own format objects; a `<input
 * type="time">` is the browser's own control and takes none at all. Both still
 * have to agree with the rest of the app about which clock this account reads,
 * so the answer comes from here rather than from a literal in each file.
 */
export function wantsTwelveHour(when: When): boolean {
	const explicit = hour12Of(when.clock);
	if (explicit !== undefined) return explicit;
	return Boolean(
		new Intl.DateTimeFormat(when.locale, { hour: 'numeric' }).resolvedOptions().hour12
	);
}
