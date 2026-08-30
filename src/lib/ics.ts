/**
 * Enough iCalendar to draw somebody else's week.
 *
 * A plan that ignores the calendar you do not control is fiction: the meetings
 * are going to happen whether or not this app knows about them. Every calendar
 * worth subscribing to publishes an `.ics` — Google calls it the "secret
 * address in iCal format" — which means read-only access with no OAuth, no
 * tokens to store and nobody in the path but the server that already hosts the
 * calendar.
 *
 * This is not a complete RFC 5545 implementation and does not try to be. It
 * reads what a work calendar actually contains: timed events, all-day events,
 * and the four recurrence rules that account for nearly every repeating
 * meeting. Anything it cannot read is skipped rather than guessed at, because a
 * meeting drawn at the wrong time is worse than a meeting that is missing.
 */

export type IcsEvent = {
	uid: string;
	summary: string;
	/** Local wall-clock, `YYYY-MM-DDTHH:MM`, matching how blocks are stored. */
	start: string;
	end: string;
	allDay: boolean;
	location: string;
};

type RawEvent = {
	uid: string;
	summary: string;
	location: string;
	start: Date;
	end: Date;
	allDay: boolean;
	rrule: string | null;
	exdates: Set<string>;
	/** A single occurrence of a series, replacing whatever the rule produced. */
	recurrenceId: string | null;
};

/**
 * Unfold the line wrapping the format requires.
 *
 * A long summary is split across lines with a leading space or tab, and a
 * parser that reads lines naively gets "Weekly plannin" followed by "g".
 */
function unfold(text: string): string[] {
	const out: string[] = [];
	for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
			out[out.length - 1] += line.slice(1);
		} else {
			out.push(line);
		}
	}
	return out;
}

/** `SUMMARY;LANGUAGE=en:Stand-up` → name, parameters, value. */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } {
	const colon = line.indexOf(':');
	if (colon === -1) return { name: line.toUpperCase(), params: {}, value: '' };

	const head = line.slice(0, colon);
	const value = line.slice(colon + 1);
	const [name, ...rest] = head.split(';');

	const params: Record<string, string> = {};
	for (const part of rest) {
		const eq = part.indexOf('=');
		if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
	}

	return { name: name.toUpperCase(), params, value };
}

/** Text values escape commas, semicolons and newlines. */
function unescapeText(value: string): string {
	return value
		.replace(/\\n/gi, ' ')
		.replace(/\\,/g, ',')
		.replace(/;/g, ';')
		.replace(/\\\\/g, '\\')
		.trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as the wall-clock string the rest of the app stores. */
export function wallClock(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `20260817T090000Z`, `20260817T090000` or `20260817`.
 *
 * A `Z` means UTC and is converted; anything else is taken as already being in
 * the calendar's own zone, which is the pragmatic reading. Honouring every
 * `TZID` would mean shipping a timezone database to do properly, and getting it
 * half right is how a meeting lands an hour out.
 */
function parseWhen(
	value: string,
	params: Record<string, string>
): { at: Date; allDay: boolean } | null {
	const date = value.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (date) {
		return {
			at: new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3])),
			allDay: params.VALUE === 'DATE' || true
		};
	}

	const stamp = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
	if (!stamp) return null;

	const [, y, mo, d, h, mi, s, zulu] = stamp;
	const at = zulu
		? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
		: new Date(+y, +mo - 1, +d, +h, +mi, +s);

	return { at, allDay: false };
}

/** Every VEVENT in the file, before recurrence is expanded. */
function readEvents(text: string): RawEvent[] {
	const events: RawEvent[] = [];
	let current: Partial<RawEvent> | null = null;

	for (const line of unfold(text)) {
		const { name, params, value } = splitLine(line);

		if (name === 'BEGIN' && value === 'VEVENT') {
			current = { exdates: new Set(), rrule: null, recurrenceId: null, location: '' };
			continue;
		}

		if (name === 'END' && value === 'VEVENT') {
			if (
				current &&
				current.start instanceof Date &&
				!isNaN(current.start.getTime()) &&
				current.summary
			) {
				// An event with no end is a point in time; give it half an hour so
				// there is something to draw.
				if (!(current.end instanceof Date) || isNaN(current.end.getTime())) {
					current.end = new Date(current.start.getTime() + 30 * 60_000);
				}
				events.push(current as RawEvent);
			}
			current = null;
			continue;
		}

		if (!current) continue;

		switch (name) {
			case 'UID':
				current.uid = value;
				break;
			case 'SUMMARY':
				current.summary = unescapeText(value);
				break;
			case 'LOCATION':
				current.location = unescapeText(value);
				break;
			case 'DTSTART': {
				const when = parseWhen(value, params);
				if (when) {
					current.start = when.at;
					current.allDay = when.allDay;
				}
				break;
			}
			case 'DTEND': {
				const when = parseWhen(value, params);
				if (when) current.end = when.at;
				break;
			}
			case 'RRULE':
				current.rrule = value;
				break;
			case 'EXDATE':
				for (const part of value.split(',')) {
					const when = parseWhen(part.trim(), params);
					if (when) current.exdates!.add(wallClock(when.at).slice(0, 10));
				}
				break;
			case 'RECURRENCE-ID': {
				const when = parseWhen(value, params);
				if (when) current.recurrenceId = wallClock(when.at).slice(0, 10);
				break;
			}
		}
	}

	return events;
}

type Rule = {
	freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
	interval: number;
	count: number | null;
	until: Date | null;
	byDay: number[];
};

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRule(rrule: string): Rule | null {
	const parts: Record<string, string> = {};
	for (const bit of rrule.split(';')) {
		const eq = bit.indexOf('=');
		if (eq > 0) parts[bit.slice(0, eq).toUpperCase()] = bit.slice(eq + 1);
	}

	const freq = parts.FREQ?.toUpperCase();
	if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;

	const until = parts.UNTIL ? parseWhen(parts.UNTIL, {}) : null;

	return {
		freq,
		interval: Math.max(1, Number(parts.INTERVAL) || 1),
		count: parts.COUNT ? Number(parts.COUNT) : null,
		until: until?.at ?? null,
		// `BYDAY=2TU` (the second Tuesday) is beyond what this reads; the day is
		// taken and the ordinal ignored, which is right far more often than not.
		byDay: (parts.BYDAY ?? '')
			.split(',')
			.map((d) => WEEKDAYS[d.trim().slice(-2).toUpperCase()])
			.filter((d) => d !== undefined)
	};
}

/** How many days to step for one turn of the rule. */
function advance(at: Date, rule: Rule): Date {
	const next = new Date(at);
	if (rule.freq === 'DAILY') next.setDate(next.getDate() + rule.interval);
	else if (rule.freq === 'WEEKLY') next.setDate(next.getDate() + 7 * rule.interval);
	else if (rule.freq === 'MONTHLY') next.setMonth(next.getMonth() + rule.interval);
	else next.setFullYear(next.getFullYear() + rule.interval);
	return next;
}

/** A safety net: a malformed rule must not spin forever. */
const MAX_OCCURRENCES = 750;

function expand(event: RawEvent, from: Date, to: Date): Date[] {
	if (!event.rrule) return event.start >= from && event.start < to ? [event.start] : [];

	const rule = parseRule(event.rrule);
	if (!rule) return event.start >= from && event.start < to ? [event.start] : [];

	const out: Date[] = [];
	let cursor = new Date(event.start);
	let produced = 0;

	while (produced < MAX_OCCURRENCES && cursor < to) {
		if (rule.until && cursor > rule.until) break;
		if (rule.count !== null && produced >= rule.count) break;

		// A weekly rule with BYDAY fires on each named day of that week, counting
		// forward from the cursor — backwards would land on days before the event
		// existed, which is how "every weekday" came out as "Mondays only".
		const days =
			rule.freq === 'WEEKLY' && rule.byDay.length > 0
				? rule.byDay
						.map((weekday) => {
							const day = new Date(cursor);
							day.setDate(day.getDate() + ((weekday - day.getDay() + 7) % 7));
							return day;
						})
						.sort((a, b) => a.getTime() - b.getTime())
				: [cursor];

		for (const day of days) {
			produced += 1;
			if (rule.count !== null && produced > rule.count) break;
			if (rule.until && day > rule.until) continue;
			if (day < from || day >= to) continue;
			if (event.exdates.has(wallClock(day).slice(0, 10))) continue;
			out.push(new Date(day));
		}

		cursor = advance(cursor, rule);
	}

	return out;
}

/**
 * Every occurrence in a window, as wall-clock events.
 *
 * `from` is inclusive, `to` exclusive, like every other range in this app.
 */
export function eventsBetween(text: string, from: Date, to: Date): IcsEvent[] {
	const raw = readEvents(text);

	// An occurrence with a RECURRENCE-ID replaces whatever the rule produced for
	// that day — the meeting somebody moved.
	const overrides = new Map<string, RawEvent>();
	for (const event of raw) {
		if (event.recurrenceId) overrides.set(`${event.uid}:${event.recurrenceId}`, event);
	}

	const out: IcsEvent[] = [];

	for (const event of raw) {
		if (event.recurrenceId) continue;

		const length = Math.max(0, event.end.getTime() - event.start.getTime());

		for (const at of expand(event, from, to)) {
			const moved = overrides.get(`${event.uid}:${wallClock(at).slice(0, 10)}`);
			const start = moved ? moved.start : at;
			const finish = moved ? moved.end : new Date(at.getTime() + length);

			out.push({
				uid: `${event.uid}:${wallClock(start)}`,
				summary: moved ? moved.summary : event.summary,
				location: moved ? moved.location : event.location,
				start: wallClock(start),
				end: wallClock(finish),
				allDay: event.allDay
			});
		}
	}

	// Anything a RECURRENCE-ID moved *into* the window from outside it.
	for (const moved of overrides.values()) {
		if (moved.start < from || moved.start >= to) continue;
		if (out.some((e) => e.start === wallClock(moved.start) && e.summary === moved.summary))
			continue;
		out.push({
			uid: `${moved.uid}:${wallClock(moved.start)}`,
			summary: moved.summary,
			location: moved.location,
			start: wallClock(moved.start),
			end: wallClock(moved.end),
			allDay: moved.allDay
		});
	}

	return out.sort((a, b) => a.start.localeCompare(b.start));
}
