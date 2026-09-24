/**
 * How often a weekly slot actually recurs.
 *
 * "Weekly" was the only option, but plenty of things are recurrent without
 * being weekly — the bins go out fortnightly, rent is the first of the month,
 * a stretch routine is every third day. This is a deliberately small subset of
 * iCalendar's RRULE: three shapes, stored as one compact string. Full RRULE is
 * a parser and a pile of edge cases in exchange for rules nobody writes.
 *
 * Serialised forms, all anchored so a rhythm has something to count from:
 *
 *   weekly:ANCHOR     — every week on the slot's weekday, from ANCHOR
 *   weekdays:D,D:A    — every week on each of these weekdays, from ANCHOR
 *   weeks:N:ANCHOR    — every N weeks on the slot's weekday, from ANCHOR
 *   days:N:ANCHOR     — every N days from ANCHOR, ignoring weekday
 *   monthly:D:ANCHOR  — day D of every month from ANCHOR; D of 29-31 clamps to
 *                       month end
 *
 * ## Several weekdays
 *
 * A thing that happens on Monday, Tuesday and Wednesday was three blocks:
 * three rows to edit, three to move, three to delete, and nothing saying they
 * were the same thing. `weekdays` is one block that lands on each of them. The
 * slot's own `weekday` column stays what it always was — the first of them —
 * so everything that reads a block's day still gets an answer, and the rule is
 * what generation actually consults.
 *
 * ANCHOR is YYYY-MM-DD. Anything unrecognised reads as plain weekly, so a bad
 * value degrades to the old behaviour rather than making a slot disappear.
 *
 * ## Why every shape has one
 *
 * `weekly` and `monthly` used to have no anchor at all, which made them rules
 * about *every* Saturday there has ever been. Walking the plan back a month
 * generated the block onto days it was invented long after, so a routine
 * started in September filled up August — a past that never happened, sitting
 * in the record beside one that did.
 *
 * The anchor is the day the rhythm starts, and nothing before it is an
 * occurrence. It stays optional in the parsed shape because rows written before
 * this existed carry none, and a rule with no anchor still means what it always
 * meant rather than vanishing.
 */
import { WEEKDAYS } from './bill-summary.js';
import type { Translate } from './i18n/core.js';

export type Recurrence =
	| { kind: 'weekly'; anchor?: string }
	| { kind: 'weekdays'; days: number[]; anchor?: string }
	| { kind: 'weeks'; interval: number; anchor: string }
	| { kind: 'days'; interval: number; anchor: string }
	| { kind: 'monthly'; day: number; anchor?: string };

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

	// A missing or malformed anchor is dropped rather than refused: the rule is
	// still the rule, it simply has no day it starts from.
	const anchorOf = (raw: string | undefined): { anchor?: string } =>
		raw && DATE_RE.test(raw) ? { anchor: raw } : {};

	if (parts[0] === 'weekly') return { kind: 'weekly', ...anchorOf(parts[1]) };

	if (parts[0] === 'weekdays') {
		// Sorted and deduplicated, so "Wednesday, Monday, Monday" is one rule
		// with two days in it and two rules that mean the same thing compare
		// equal. Anything unreadable degrades to plain weekly, as every shape
		// here does.
		const days = [
			...new Set(
				(parts[1] ?? '')
					.split(',')
					// `Number('')` is 0, which would read an empty list as Monday.
					.filter((part) => part.trim() !== '')
					.map(Number)
			)
		]
			.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
			.sort((a, b) => a - b);
		if (days.length === 0) return WEEKLY;
		return { kind: 'weekdays', days, ...anchorOf(parts[2]) };
	}

	if (parts[0] === 'weeks' || parts[0] === 'days') {
		const interval = Number(parts[1]);
		const anchor = parts[2] ?? '';
		if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return WEEKLY;
		// These two are counted *from* the anchor, so without one they are not a
		// rule at all — hence refused rather than anchorless.
		if (!DATE_RE.test(anchor)) return WEEKLY;
		return { kind: parts[0], interval, anchor };
	}

	if (parts[0] === 'monthly') {
		const day = Number(parts[1]);
		if (!Number.isInteger(day) || day < 1 || day > 31) return WEEKLY;
		return { kind: 'monthly', day, ...anchorOf(parts[2]) };
	}

	return WEEKLY;
}

export function serialiseRecurrence(r: Recurrence): string {
	switch (r.kind) {
		case 'weekdays': {
			const days = r.days.join(',');
			return r.anchor ? `weekdays:${days}:${r.anchor}` : `weekdays:${days}`;
		}
		case 'weeks':
			return `weeks:${r.interval}:${r.anchor}`;
		case 'days':
			return `days:${r.interval}:${r.anchor}`;
		case 'monthly':
			return r.anchor ? `monthly:${r.day}:${r.anchor}` : `monthly:${r.day}`;
		default:
			return r.anchor ? `weekly:${r.anchor}` : 'weekly';
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

	// Nothing happens before a rhythm starts. Checked once, here, so every shape
	// obeys it and a shape added later cannot forget to.
	if (r.anchor && daysBetween(r.anchor, formatDate(date)) < 0) return false;

	switch (r.kind) {
		case 'weekly':
			return dateWeekday === weekday;

		case 'weekdays':
			return r.days.includes(dateWeekday);

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
		case 'weekdays':
			// The weekdays carry the move; the start date is when the rhythm began
			// and dragging one occurrence does not rewrite that.
			return r;
		case 'weeks':
		case 'days':
			return { ...r, anchor: formatDate(date) };
		case 'monthly':
			return { ...r, day: date.getDate() };
	}
}

/**
 * A short human description, for a list row that has no space for a form.
 *
 * `weekday` is the block's own, Monday-indexed, for the shapes that have
 * exactly one. The words come from the catalogue, so the sentence is in the
 * reader's language — weekday names included.
 */
export function describeRecurrence(r: Recurrence, weekday: number, t: Translate): string {
	const dayName = (d: number) => {
		const known = WEEKDAYS[d];
		return known ? t(known.label) : String(d);
	};
	switch (r.kind) {
		case 'weekly':
			return t('recurrence.weekly', { weekday: dayName(weekday) });

		case 'weekdays': {
			if (r.days.length === 7) return t('recurrence.everyDay');
			const days = new Intl.ListFormat(t.locale, { type: 'conjunction' }).format(
				r.days.map(dayName)
			);
			return t('recurrence.weekdays', { days });
		}
		case 'weeks':
			return r.interval === 2
				? t('recurrence.everyOtherWeek', { weekday: dayName(weekday) })
				: t('recurrence.everyNWeeks', { count: r.interval, weekday: dayName(weekday) });
		case 'days':
			return t('recurrence.everyNDays', { count: r.interval });
		case 'monthly':
			return t('recurrence.monthly', { day: r.day });
	}
}
