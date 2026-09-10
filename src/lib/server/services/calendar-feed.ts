import { getUpcomingSchedule, type ScheduleOccurrence } from './schedule.js';
import type { Ctx } from './ctx.js';

/**
 * The plan, published as a calendar anybody's software can read.
 *
 * `calendars.ts` is the other direction — reading a feed somebody else
 * publishes. This one hands ontoplano's own week to Google Calendar, Apple
 * Calendar, Thunderbird, a phone's default app: every one of them can subscribe
 * to a URL that returns `text/calendar`, with no OAuth, no app to install and
 * nothing of ontoplano's in the path but one GET.
 *
 * **Occurrences, not rules.** The obvious implementation emits weekly blocks as
 * `RRULE:FREQ=WEEKLY` and lets the calendar expand them, which is fewer bytes
 * and a great deal more ways to be wrong: every-N-weeks anchors, the monthly
 * rules that land on the 31st of a short month, and above all the occurrences
 * somebody has skipped, which would need an `EXDATE` for each and would silently
 * come back if one were missed. `ics.ts` says it in the other direction and it
 * holds here: a meeting drawn at the wrong time is worse than a meeting that is
 * missing. So the server expands the window itself, using the same code the app
 * and the API already use, and publishes what it knows.
 *
 * The cost is that the feed is a window rather than all of history, which is
 * what a subscription is for anyway — nobody scrolls their calendar to last
 * March to see whether they had a gym block.
 */

/**
 * How far ahead the published window reaches.
 *
 * `getUpcomingSchedule` caps a request at 31 days and this stays inside that
 * rather than reaching past it into the generator: the cap is that service's
 * stated contract, and a caller that quietly exceeds it is the reason contracts
 * stop meaning anything. A month is also about right for a subscription — a
 * plan four months out is a guess, and the feed refreshes hourly.
 */
export const FEED_DAYS_AHEAD = 31;

/**
 * `20260817T090000` — a naive local stamp, deliberately with no `Z`.
 *
 * Blocks are wall-clock values: "09:00" means nine in the morning wherever the
 * account is, and it stays nine after a flight and after daylight saving. A UTC
 * conversion here would pin them to the offset in force on the day the feed was
 * generated, which is how a plan ends up an hour out for half the year.
 */
function stamp(local: string): string {
	// `2026-08-17T09:00:00` → `20260817T090000`
	const [date, time = '00:00:00'] = local.split('T');
	return `${date.replace(/-/g, '')}T${time.replace(/:/g, '').padEnd(6, '0')}`;
}

function addMinutes(local: string, minutes: number): string {
	const [date, time = '00:00:00'] = local.split('T');
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi, s] = time.split(':').map(Number);
	const at = new Date(y, mo - 1, d, h, mi + minutes, s || 0);

	const pad = (n: number) => String(n).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/**
 * Escape a text value.
 *
 * Backslash first, or every escape this adds gets escaped again by the ones
 * after it. A newline becomes `\n` rather than a real one, because a bare
 * newline inside a value ends the property and turns the rest of somebody's
 * note into a malformed line the calendar drops the whole event over.
 */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		// \r too, not only \n: a bare carriage return in a stored title would
		// end the line for a lenient parser, and the rest of the value would
		// arrive as an ICS property somebody else chose.
		.replace(/\r\n|\r|\n/g, '\\n')
		.replace(/,/g, '\\,')
		.replace(/;/g, '\\;');
}

/**
 * Fold at 75 octets, as the format requires.
 *
 * Measured in bytes rather than characters: the limit is octets, and a note
 * with an accent or an emoji in it would otherwise be folded a byte or three
 * late — which some parsers accept and some reject, and the ones that reject it
 * drop the event.
 */
function fold(line: string): string {
	const bytes = Buffer.from(line, 'utf8');
	if (bytes.length <= 75) return line;

	const out: string[] = [];
	let start = 0;
	while (start < bytes.length) {
		// One less on continuation lines: they carry a leading space.
		const limit = out.length === 0 ? 75 : 74;
		let end = Math.min(start + limit, bytes.length);

		// Never split a multi-byte character: back up off a continuation byte.
		while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;

		out.push((out.length === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
		start = end;
	}
	return out.join('\r\n');
}

/**
 * A stable identity for an occurrence.
 *
 * It has to survive being regenerated: a calendar that sees a new UID for the
 * same block treats it as a different event, so a feed with unstable ids
 * duplicates somebody's week on every refresh instead of updating it. The
 * source, the block's own id and the date it falls on are exactly what does not
 * change between two fetches.
 */
function uidFor(occurrence: ScheduleOccurrence, host: string): string {
	// The occurrence id already carries its source (`slot:457`), so this does not
	// add it again — `slot-slot:457` was a UID that worked and read as a bug. The
	// colon becomes a dash because a UID travels through a lot of other people's
	// software and there is nothing to gain by finding out which of it minds.
	return `${occurrence.id.replace(/:/g, '-')}-${occurrence.local_date}@${host}`;
}

function event(occurrence: ScheduleOccurrence, host: string, now: string): string[] {
	const end = addMinutes(occurrence.at_local, occurrence.duration_minutes);

	const lines = [
		'BEGIN:VEVENT',
		`UID:${uidFor(occurrence, host)}`,
		`DTSTAMP:${stamp(now)}`,
		`DTSTART:${stamp(occurrence.at_local)}`,
		`DTEND:${stamp(end)}`,
		`SUMMARY:${escapeText(occurrence.title)}`
	];

	// The category is what the colour means in the app; a calendar that shows
	// categories can colour by it, and one that cannot ignores the line.
	if (occurrence.category) lines.push(`CATEGORIES:${escapeText(occurrence.category)}`);

	// The label is whatever was typed on the block beyond its name. It goes in
	// the description rather than the summary so the row stays short.
	if (occurrence.label && occurrence.label !== occurrence.title) {
		lines.push(`DESCRIPTION:${escapeText(occurrence.label)}`);
	}

	if (occurrence.meta.location)
		lines.push(`LOCATION:${escapeText(String(occurrence.meta.location))}`);

	// Something already done is not something to be reminded about.
	lines.push(`STATUS:${occurrence.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
	lines.push('END:VEVENT');

	return lines;
}

/**
 * The whole feed, as the bytes to serve.
 *
 * `PUBLISH` and `X-WR-CALNAME` are what make a subscription show up named
 * rather than as an untitled calendar; they are not in RFC 5545 but every
 * client reads them, and a feed nobody can tell apart from their others is a
 * feed they turn off.
 */
export function buildFeed(
	ctx: Ctx,
	opts: { host: string; calendarName?: string; days?: number } = { host: 'ontoplano' }
): string {
	const days = opts.days ?? FEED_DAYS_AHEAD;
	const { occurrences, timezone } = getUpcomingSchedule(ctx, {
		days,
		includeCompleted: true
	});

	const now = toLocal(ctx.now);
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//ontoplano//plan//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(opts.calendarName ?? 'Ontoplano')}`,
		`X-WR-TIMEZONE:${escapeText(timezone)}`,
		// How often a client is asked to come back. A plan changes a few times a
		// day at most, and every client treats this as a hint anyway.
		'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
		'X-PUBLISHED-TTL:PT1H'
	];

	for (const occurrence of occurrences) lines.push(...event(occurrence, opts.host, now));

	lines.push('END:VCALENDAR');

	// CRLF between lines and a trailing one: the format says so, and the stricter
	// parsers — Outlook among them — mean it.
	return lines.map(fold).join('\r\n') + '\r\n';
}

function toLocal(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
