/**
 * How often a weekly slot actually recurs.
 *
 * "Weekly" was the only option, but plenty of things are recurrent without
 * being weekly — the bins go out fortnightly, rent is the first of the month,
 * a stretch routine is every third day. This is a deliberately small subset of
 * iCalendar's RRULE: three shapes, stored as one compact string. Full RRULE is
 * a parser and a pile of edge cases in exchange for rules nobody writes.
 *
 * Serialised forms, all anchored so "every 2 weeks" has something to count from:
 *
 *   weekly            — every week on the slot's weekday (the default)
 *   weeks:N:ANCHOR    — every N weeks on the slot's weekday, from ANCHOR
 *   days:N:ANCHOR     — every N days from ANCHOR, ignoring weekday
 *   monthly:D         — day D of every month; D of 29-31 clamps to month end
 *
 * ANCHOR is YYYY-MM-DD. Anything unrecognised reads as plain weekly, so a bad
 * value degrades to the old behaviour rather than making a slot disappear.
 */
export type Recurrence =
	| { kind: 'weekly' }
	| { kind: 'weeks'; interval: number; anchor: string }
	| { kind: 'days'; interval: number; anchor: string }
	| { kind: 'monthly'; day: number };

export const WEEKLY: Recurrence = { kind: 'weekly' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_INTERVAL = 52;

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days between two dates, ignoring clock time and DST. */
function daysBetween(from: string, to: string): number {
	const a = Date.UTC(
		Number(from.slice(0, 4)),
		Number(from.slice(5, 7)) - 1,
		Number(from.slice(8, 10))
	);
	const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
	return Math.round((b - a) / 86_400_000);
}

export function parseRecurrence(raw: string | null | undefined): Recurrence {
	if (!raw) return WEEKLY;
	const parts = raw.split(':');

	if (parts[0] === 'weekly') return WEEKLY;

	if (parts[0] === 'weeks' || parts[0] === 'days') {
		const interval = Number(parts[1]);
		const anchor = parts[2] ?? '';
		if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return WEEKLY;
		if (!DATE_RE.test(anchor)) return WEEKLY;
		return { kind: parts[0], interval, anchor };
	}

	if (parts[0] === 'monthly') {
		const day = Number(parts[1]);
		if (!Number.isInteger(day) || day < 1 || day > 31) return WEEKLY;
		return { kind: 'monthly', day };
	}

	return WEEKLY;
}

export function serialiseRecurrence(r: Recurrence): string {
	switch (r.kind) {
		case 'weeks':
			return `weeks:${r.interval}:${r.anchor}`;
		case 'days':
			return `days:${r.interval}:${r.anchor}`;
		case 'monthly':
			return `monthly:${r.day}`;
		default:
			return 'weekly';
	}
}

/** Last day of the month `date` falls in. */
function lastDayOfMonth(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Does this rule put an occurrence on this date?
 *
 * `weekday` is the slot's own Monday-indexed weekday, which the weekly and
 * every-N-weeks shapes still respect; the day and month shapes ignore it.
 */
export function occursOn(r: Recurrence, date: Date, weekday: number): boolean {
	const dateWeekday = (date.getDay() + 6) % 7;

	switch (r.kind) {
		case 'weekly':
			return dateWeekday === weekday;

		case 'weeks': {
			if (dateWeekday !== weekday) return false;
			const delta = daysBetween(r.anchor, formatDate(date));
			if (delta < 0) return false;
			// Whole weeks since the anchor, so "every 2 weeks" lands on alternate ones.
			return Math.floor(delta / 7) % r.interval === 0;
		}

		case 'days': {
			const delta = daysBetween(r.anchor, formatDate(date));
			return delta >= 0 && delta % r.interval === 0;
		}

		case 'monthly': {
			// The 31st in a 30-day month falls on the 30th rather than being skipped:
			// "the last day of the month" is what someone picking 31 means.
			const target = Math.min(r.day, lastDayOfMonth(date));
			return date.getDate() === target;
		}
	}
}

/**
 * The same rhythm, moved to land on this date.
 *
 * Dragging a block across the grid says "not then, this instead", which for a
 * weekly block the weekday alone records. Every other shape counts from
 * something the weekday does not name — an anchor date, a day of the month —
 * and dropping it somewhere new has to move that too, or the block springs
 * straight back and the drag looks broken.
 */
export function reanchor(r: Recurrence, date: Date): Recurrence {
	switch (r.kind) {
		case 'weekly':
			return r;
		case 'weeks':
		case 'days':
			return { ...r, anchor: formatDate(date) };
		case 'monthly':
			return { kind: 'monthly', day: date.getDate() };
	}
}

/** A short human description, for a list row that has no space for a form. */
export function describeRecurrence(r: Recurrence, weekdayName: string): string {
	switch (r.kind) {
		case 'weekly':
			return `Every ${weekdayName}`;
		case 'weeks':
			return r.interval === 2
				? `Every other ${weekdayName}`
				: `Every ${r.interval} weeks on ${weekdayName}`;
		case 'days':
			return r.interval === 1 ? 'Every day' : `Every ${r.interval} days`;
		case 'monthly':
			return `Day ${r.day} of each month`;
	}
}
