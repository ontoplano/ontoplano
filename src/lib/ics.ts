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
 *
 * Times are read in the zone they were written in — `TZID`, `Z`, or none at
 * all, which RFC 5545 calls floating and means the reader's own — and drawn in
 * the account's. The server's zone never enters into it: two deployments of the
 * same version draw the same feed the same way.
 */

import { instantOfLocal, localOfInstant } from './services/time.js';
import { WINDOWS_ZONES } from './windows-zones.js';

export type IcsEvent = {
	uid: string;
	summary: string;
	/** Local wall-clock, `YYYY-MM-DDTHH:MM`, matching how blocks are stored. */
	start: string;
	end: string;
	allDay: boolean;
	location: string;
};

/**
 * A time as written: the wall clock, and the zone it is on.
 *
 * `wall` is `YYYY-MM-DDTHH:MM:SS`. A date-only value is midnight on `UTC`,
 * which is never converted — an all-day event is a civil date, the same day
 * wherever it is read.
 */
type Stamp = { wall: string; zone: string; dateOnly: boolean };

type RawEvent = {
	uid: string;
	summary: string;
	location: string;
	start: Stamp;
	end: Stamp;
	allDay: boolean;
	rrule: string | null;
	/** Cancelled days, as dates in the zone the series is written in. */
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

/**
 * Text values escape commas, semicolons and newlines.
 *
 * The semicolon line used to read `.replace(/;/g, ';')` — a semicolon replaced
 * by a semicolon, which is nothing at all, so `\;` came through with its
 * backslash still attached and every subscribed meeting with a semicolon in its
 * name read "Standup\; then triage". Found by generating a feed in
 * `calendar-feed.ts` and reading it back through here.
 */
function unescapeText(value: string): string {
	return value
		.replace(/\\n/gi, ' ')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\')
		.trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as the wall-clock string the rest of the app stores. */
export function wallClock(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/*
 * Wall clocks are stepped as `Date`s read with the UTC getters, so that adding
 * a day is adding a day: the process's own zone, and its DST changes, have no
 * say in where "next Tuesday at nine" lands.
 */
const naive = (wall: string) => new Date(`${wall}Z`);
const wallOf = (d: Date) => d.toISOString().slice(0, 19);

const known = new Map<string, boolean>();

function isZone(name: string): boolean {
	let ok = known.get(name);
	if (ok === undefined) {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: name });
			ok = true;
		} catch {
			ok = false;
		}
		known.set(name, ok);
	}
	return ok;
}

/**
 * The IANA zone a `TZID` names, or null when it names nothing this can read.
 *
 * Three spellings turn up: IANA itself (Google), Windows names (Outlook and
 * Microsoft 365), and IANA behind a vendor prefix
 * (`/mozilla.org/20050126_1/Europe/Berlin`). A feed's own `VTIMEZONE` blocks
 * are not read — every zone they describe is one of these.
 */
export function zoneOf(tzid: string): string | null {
	const name = tzid.trim();
	if (WINDOWS_ZONES[name]) return WINDOWS_ZONES[name];
	if (name.includes('/') && isZone(name)) return name;
	const tail = name.match(/[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_]+)?$/);
	if (tail && isZone(tail[0])) return tail[0];
	return name === 'UTC' || name === 'GMT' ? 'UTC' : null;
}

/**
 * `20260817T090000Z`, `20260817T090000` or `20260817`.
 *
 * A `Z` is UTC, a `TZID` is that zone, and neither is floating — the account's
 * own. A `TZID` that names no zone this knows makes the value unreadable, and
 * the event is skipped rather than drawn at the hour the number happens to say.
 */
function parseWhen(value: string, params: Record<string, string>, floating: string): Stamp | null {
	const date = value.match(/^(\d{4})(\d{2})(\d{2})$/);
	if (date)
		return { wall: `${date[1]}-${date[2]}-${date[3]}T00:00:00`, zone: 'UTC', dateOnly: true };

	const stamp = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
	if (!stamp) return null;

	const [, y, mo, d, h, mi, s, zulu] = stamp;
	const zone = zulu ? 'UTC' : params.TZID ? zoneOf(params.TZID) : floating;
	if (!zone) return null;

	const wall = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
	if (Number.isNaN(naive(wall).getTime())) return null;
	return { wall, zone, dateOnly: false };
}

const instantOf = (stamp: Stamp) => instantOfLocal(stamp.wall, stamp.zone);

/** The same moment, on another zone's wall clock. */
function wallIn(stamp: Stamp, zone: string): string {
	if (stamp.dateOnly || stamp.zone === zone) return stamp.wall;
	return localOfInstant(instantOf(stamp), zone);
}

/** Every VEVENT in the file, before recurrence is expanded. */
function readEvents(text: string, tz: string): RawEvent[] {
	const events: RawEvent[] = [];
	let current: Partial<RawEvent> | null = null;
	// Read once the event is complete: the series' zone is DTSTART's, and an
	// EXDATE may come before it.
	let exdates: Stamp[] = [];
	let recurrenceId: Stamp | null = null;

	for (const line of unfold(text)) {
		const { name, params, value } = splitLine(line);

		if (name === 'BEGIN' && value === 'VEVENT') {
			current = { exdates: new Set(), rrule: null, recurrenceId: null, location: '' };
			exdates = [];
			recurrenceId = null;
			continue;
		}

		if (name === 'END' && value === 'VEVENT') {
			const start = current?.start;
			if (current && start && current.summary) {
				// An event with no end is a point in time; give it half an hour so
				// there is something to draw.
				if (!current.end) {
					const end = naive(start.wall);
					end.setUTCMinutes(end.getUTCMinutes() + 30);
					current.end = { ...start, wall: wallOf(end) };
				}
				for (const ex of exdates) current.exdates!.add(wallIn(ex, start.zone).slice(0, 10));
				if (recurrenceId) current.recurrenceId = wallIn(recurrenceId, start.zone).slice(0, 10);
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
				const when = parseWhen(value, params, tz);
				if (when) {
					current.start = when;
					current.allDay = when.dateOnly;
				}
				break;
			}
			case 'DTEND': {
				const when = parseWhen(value, params, tz);
				if (when) current.end = when;
				break;
			}
			case 'RRULE':
				current.rrule = value;
				break;
			case 'EXDATE':
				for (const part of value.split(',')) {
					const when = parseWhen(part.trim(), params, tz);
					if (when) exdates.push(when);
				}
				break;
			case 'RECURRENCE-ID':
				recurrenceId = parseWhen(value, params, tz);
				break;
		}
	}

	return events;
}

type Rule = {
	freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
	interval: number;
	count: number | null;
	/** The last wall clock allowed, in the series' own zone. Inclusive. */
	until: string | null;
	byDay: number[];
};

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRule(rrule: string, zone: string): Rule | null {
	const parts: Record<string, string> = {};
	for (const bit of rrule.split(';')) {
		const eq = bit.indexOf('=');
		if (eq > 0) parts[bit.slice(0, eq).toUpperCase()] = bit.slice(eq + 1);
	}

	const freq = parts.FREQ?.toUpperCase();
	if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;

	// UNTIL is UTC when it ends in `Z` and the series' own wall clock when it
	// does not; either way it is compared on the series' wall clock. A date
	// alone means the whole of that day.
	const until = parts.UNTIL ? parseWhen(parts.UNTIL, {}, zone) : null;

	return {
		freq,
		interval: Math.max(1, Number(parts.INTERVAL) || 1),
		count: parts.COUNT ? Number(parts.COUNT) : null,
		until: until
			? until.dateOnly
				? `${until.wall.slice(0, 10)}T23:59:59`
				: wallIn(until, zone)
			: null,
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
	if (rule.freq === 'DAILY') next.setUTCDate(next.getUTCDate() + rule.interval);
	else if (rule.freq === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7 * rule.interval);
	else if (rule.freq === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + rule.interval);
	else next.setUTCFullYear(next.getUTCFullYear() + rule.interval);
	return next;
}

/** A safety net: a malformed rule must not spin forever. */
const MAX_OCCURRENCES = 750;

/**
 * Every start of a series up to `to`, as wall clocks in the series' own zone.
 *
 * Stepped on that wall clock rather than in instants, so a weekly nine o'clock
 * stays at nine across the series' DST change — and moves, correctly, across
 * the reader's.
 */
function expand(event: RawEvent, to: Date): string[] {
	const rule = event.rrule ? parseRule(event.rrule, event.start.zone) : null;
	if (!rule) return [event.start.wall];

	const out: string[] = [];
	let cursor = naive(event.start.wall);
	let produced = 0;
	const past = (wall: string) => instantOfLocal(wall, event.start.zone) >= to;

	while (produced < MAX_OCCURRENCES && !past(wallOf(cursor))) {
		if (rule.until && wallOf(cursor) > rule.until) break;
		if (rule.count !== null && produced >= rule.count) break;

		// A weekly rule with BYDAY fires on each named day of that week, counting
		// forward from the cursor — backwards would land on days before the event
		// existed, which is how "every weekday" came out as "Mondays only".
		const days =
			rule.freq === 'WEEKLY' && rule.byDay.length > 0
				? rule.byDay
						.map((weekday) => {
							const day = new Date(cursor);
							day.setUTCDate(day.getUTCDate() + ((weekday - day.getUTCDay() + 7) % 7));
							return day;
						})
						.sort((a, b) => a.getTime() - b.getTime())
				: [cursor];

		for (const day of days) {
			produced += 1;
			if (rule.count !== null && produced > rule.count) break;
			const wall = wallOf(day);
			if (rule.until && wall > rule.until) continue;
			if (event.exdates.has(wall.slice(0, 10))) continue;
			out.push(wall);
		}

		cursor = advance(cursor, rule);
	}

	return out;
}

/** A stamp as the account's wall clock, `YYYY-MM-DDTHH:MM`. */
function shown(stamp: Stamp, tz: string): string {
	return wallIn(stamp, tz).slice(0, 16);
}

/** The process's own zone: what a caller that names none has always had. */
const processZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Every occurrence in a window, as wall-clock events in `tz`.
 *
 * `from` is inclusive, `to` exclusive, like every other range in this app;
 * both name days by their own date, the way the planner builds them, and are
 * read as midnight in `tz`.
 */
export function eventsBetween(
	text: string,
	from: Date,
	to: Date,
	tz: string = processZone()
): IcsEvent[] {
	const raw = readEvents(text, tz);
	const fromWall = `${wallClock(from).slice(0, 10)}T00:00`;
	const toWall = `${wallClock(to).slice(0, 10)}T00:00`;
	// Generous by a day: a series in a zone ahead of `tz` reaches the window's
	// last day while its own calendar already says tomorrow.
	const horizon = new Date(instantOfLocal(toWall, tz).getTime() + 86_400_000);
	const inWindow = (start: string) => start >= fromWall && start < toWall;

	// An occurrence with a RECURRENCE-ID replaces whatever the rule produced for
	// that day — the meeting somebody moved.
	const overrides = new Map<string, RawEvent>();
	for (const event of raw) {
		if (event.recurrenceId) overrides.set(`${event.uid}:${event.recurrenceId}`, event);
	}

	const out: IcsEvent[] = [];
	const push = (event: RawEvent, start: Stamp, end: Stamp) => {
		const at = shown(start, tz);
		if (!inWindow(at)) return;
		out.push({
			uid: `${event.uid}:${at}`,
			summary: event.summary,
			location: event.location,
			start: at,
			end: shown(end, tz),
			allDay: event.allDay
		});
	};

	for (const event of raw) {
		if (event.recurrenceId) continue;

		const length = Math.max(0, naive(event.end.wall).getTime() - naive(event.start.wall).getTime());
		// An end in another zone than the start is rare; its length is the real one.
		const real = Math.max(0, instantOf(event.end).getTime() - instantOf(event.start).getTime());

		for (const wall of expand(event, horizon)) {
			const moved = overrides.get(`${event.uid}:${wall.slice(0, 10)}`);
			if (moved) {
				push(moved, moved.start, moved.end);
				continue;
			}
			const start = { ...event.start, wall };
			const end =
				event.end.zone === event.start.zone
					? { ...event.start, wall: wallOf(new Date(naive(wall).getTime() + length)) }
					: {
							wall: localOfInstant(new Date(instantOf(start).getTime() + real), 'UTC'),
							zone: 'UTC',
							dateOnly: false
						};
			push(event, start, end);
		}
	}

	// Anything a RECURRENCE-ID moved *into* the window from outside it.
	for (const moved of overrides.values()) {
		const at = shown(moved.start, tz);
		if (out.some((e) => e.start === at && e.summary === moved.summary)) continue;
		push(moved, moved.start, moved.end);
	}

	return out.sort((a, b) => a.start.localeCompare(b.start));
}
