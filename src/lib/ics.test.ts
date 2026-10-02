import { describe, expect, test } from 'vitest';
import { eventsBetween } from './ics';

/**
 * A meeting drawn at the wrong time is worse than a meeting that is missing,
 * so these are mostly about what the parser refuses to guess at.
 */
const WEEK_FROM = new Date('2026-08-17T00:00:00');
const WEEK_TO = new Date('2026-08-24T00:00:00');

function ics(...events: string[]): string {
	return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

function event(lines: string[]): string {
	return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
}

describe('one event', () => {
	test('a timed event, in the calendar’s own zone', () => {
		const [only] = eventsBetween(
			ics(event(['UID:a', 'SUMMARY:Stand-up', 'DTSTART:20260817T090000', 'DTEND:20260817T091500'])),
			WEEK_FROM,
			WEEK_TO
		);

		expect(only.summary).toBe('Stand-up');
		expect(only.start).toBe('2026-08-17T09:00');
		expect(only.end).toBe('2026-08-17T09:15');
		expect(only.allDay).toBe(false);
	});

	test('an all-day event', () => {
		const [only] = eventsBetween(
			ics(event(['UID:b', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20260818'])),
			WEEK_FROM,
			WEEK_TO
		);
		expect(only.allDay).toBe(true);
		expect(only.start).toBe('2026-08-18T00:00');
	});

	test('an event with no end gets half an hour, so there is something to draw', () => {
		const [only] = eventsBetween(
			ics(event(['UID:c', 'SUMMARY:Call', 'DTSTART:20260817T140000'])),
			WEEK_FROM,
			WEEK_TO
		);
		expect(only.end).toBe('2026-08-17T14:30');
	});

	test('a folded summary is put back together', () => {
		const raw = ics(
			[
				'BEGIN:VEVENT',
				'UID:d',
				'SUMMARY:Weekly plannin',
				' g session',
				'DTSTART:20260817T100000',
				'END:VEVENT'
			].join('\r\n')
		);
		expect(eventsBetween(raw, WEEK_FROM, WEEK_TO)[0].summary).toBe('Weekly planning session');
	});

	test('escaped commas and newlines come back as text', () => {
		const [only] = eventsBetween(
			ics(event(['UID:e', 'SUMMARY:Lunch\\, then a walk', 'DTSTART:20260817T120000'])),
			WEEK_FROM,
			WEEK_TO
		);
		expect(only.summary).toBe('Lunch, then a walk');
	});

	test('an event outside the window is not returned', () => {
		expect(
			eventsBetween(
				ics(event(['UID:f', 'SUMMARY:Last month', 'DTSTART:20260717T090000'])),
				WEEK_FROM,
				WEEK_TO
			)
		).toEqual([]);
	});

	test('an event with no summary is skipped rather than drawn blank', () => {
		expect(
			eventsBetween(ics(event(['UID:g', 'DTSTART:20260817T090000'])), WEEK_FROM, WEEK_TO)
		).toEqual([]);
	});

	test('a date it cannot read is skipped rather than guessed at', () => {
		expect(
			eventsBetween(ics(event(['UID:h', 'SUMMARY:Bad', 'DTSTART:not-a-date'])), WEEK_FROM, WEEK_TO)
		).toEqual([]);
	});
});

describe('repeating meetings', () => {
	test('every weekday', () => {
		const found = eventsBetween(
			ics(
				event([
					'UID:i',
					'SUMMARY:Stand-up',
					'DTSTART:20260817T090000',
					'DTEND:20260817T091500',
					'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
				])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found.map((e) => e.start.slice(0, 10))).toEqual([
			'2026-08-17',
			'2026-08-18',
			'2026-08-19',
			'2026-08-20',
			'2026-08-21'
		]);
	});

	test('every day, and each keeps its length', () => {
		const found = eventsBetween(
			ics(
				event([
					'UID:j',
					'SUMMARY:Medication',
					'DTSTART:20260817T080000',
					'DTEND:20260817T080500',
					'RRULE:FREQ=DAILY'
				])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found).toHaveLength(7);
		expect(found[3].start).toBe('2026-08-20T08:00');
		expect(found[3].end).toBe('2026-08-20T08:05');
	});

	test('every other week', () => {
		const found = eventsBetween(
			ics(
				event(['UID:k', 'SUMMARY:Retro', 'DTSTART:20260817T150000', 'RRULE:FREQ=WEEKLY;INTERVAL=2'])
			),
			new Date('2026-08-17T00:00:00'),
			new Date('2026-09-14T00:00:00')
		);
		expect(found.map((e) => e.start.slice(0, 10))).toEqual(['2026-08-17', '2026-08-31']);
	});

	test('COUNT stops it', () => {
		const found = eventsBetween(
			ics(
				event(['UID:l', 'SUMMARY:Course', 'DTSTART:20260817T190000', 'RRULE:FREQ=DAILY;COUNT=3'])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found).toHaveLength(3);
	});

	test('UNTIL stops it', () => {
		const found = eventsBetween(
			ics(
				event([
					'UID:m',
					'SUMMARY:Cover',
					'DTSTART:20260817T110000',
					'RRULE:FREQ=DAILY;UNTIL=20260819T235900Z'
				])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found.map((e) => e.start.slice(0, 10))).toEqual([
			'2026-08-17',
			'2026-08-18',
			'2026-08-19'
		]);
	});

	test('a cancelled occurrence is left out', () => {
		const found = eventsBetween(
			ics(
				event([
					'UID:n',
					'SUMMARY:Stand-up',
					'DTSTART:20260817T090000',
					'RRULE:FREQ=DAILY',
					'EXDATE:20260819T090000'
				])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found.map((e) => e.start.slice(0, 10))).not.toContain('2026-08-19');
		expect(found).toHaveLength(6);
	});

	test('a moved occurrence moves', () => {
		const found = eventsBetween(
			ics(
				event(['UID:o', 'SUMMARY:Stand-up', 'DTSTART:20260817T090000', 'RRULE:FREQ=DAILY;COUNT=3']),
				event([
					'UID:o',
					'SUMMARY:Stand-up (late)',
					'RECURRENCE-ID:20260818T090000',
					'DTSTART:20260818T160000',
					'DTEND:20260818T161500'
				])
			),
			WEEK_FROM,
			WEEK_TO
		);

		const tuesday = found.find((e) => e.start.startsWith('2026-08-18'))!;
		expect(tuesday.start).toBe('2026-08-18T16:00');
		expect(tuesday.summary).toBe('Stand-up (late)');
	});

	test('a rule it cannot read falls back to the one occurrence', () => {
		const found = eventsBetween(
			ics(
				event([
					'UID:p',
					'SUMMARY:Odd',
					'DTSTART:20260817T090000',
					'RRULE:FREQ=SECONDLY;INTERVAL=30'
				])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found).toHaveLength(1);
	});
});

describe('a whole file', () => {
	test('nothing in it is nothing out', () => {
		expect(eventsBetween('', WEEK_FROM, WEEK_TO)).toEqual([]);
		expect(eventsBetween('not a calendar at all', WEEK_FROM, WEEK_TO)).toEqual([]);
	});

	test('results come back in order', () => {
		const found = eventsBetween(
			ics(
				event(['UID:q', 'SUMMARY:Later', 'DTSTART:20260819T150000']),
				event(['UID:r', 'SUMMARY:Earlier', 'DTSTART:20260817T080000'])
			),
			WEEK_FROM,
			WEEK_TO
		);
		expect(found.map((e) => e.summary)).toEqual(['Earlier', 'Later']);
	});
});

/**
 * What somebody else's calendar wrote, read back as they wrote it.
 *
 * Escaping is where a parser fails quietly: the event still appears, it is just
 * subtly wrong, so nobody files it and everybody sees it. The semicolon case
 * below shipped — `\;` came through with its backslash attached, because the
 * rule meant to strip it replaced a semicolon with a semicolon.
 */
describe('the text of an event', () => {
	function summaryOf(raw: string): string {
		const [only] = eventsBetween(
			ics(event(['UID:esc', `SUMMARY:${raw}`, 'DTSTART:20260817T090000', 'DTEND:20260817T091500'])),
			WEEK_FROM,
			WEEK_TO
		);
		return only.summary;
	}

	test('gives back a comma', () => {
		expect(summaryOf('Buy milk\\, bread')).toBe('Buy milk, bread');
	});

	test('gives back a semicolon, without the backslash in front of it', () => {
		// `\\;` in this literal is the two characters `\` and `;` in the file —
		// which is the escape the format actually writes. `'\;'` would be a bare
		// semicolon and would pass against the bug it is here to catch.
		expect(summaryOf('Standup\\; then triage')).toBe('Standup; then triage');
	});

	test('gives back a backslash', () => {
		expect(summaryOf('a\\\\b')).toBe('a\\b');
	});

	test('and turns an escaped newline into a space, so a row stays one line', () => {
		expect(summaryOf('Two\\nlines')).toBe('Two lines');
	});
});

/*
 * Issue #15: a Microsoft 365 feed, read for an account in Nairobi. Every
 * answer below has to be the same whatever zone the server runs in — the
 * suite is run under several `TZ`s to hold that.
 */
describe('zones', () => {
	const NAIROBI = 'Africa/Nairobi';
	const FROM = new Date(2026, 9, 5);
	const TO = new Date(2026, 9, 26);
	const feed = ics(
		event([
			'UID:repro-1',
			'SUMMARY:Eastern 09:00 meeting',
			'DTSTART;TZID=Eastern Standard Time:20261006T090000',
			'DTEND;TZID=Eastern Standard Time:20261006T100000'
		]),
		event([
			'UID:repro-2',
			'SUMMARY:UTC 12:00 meeting',
			'DTSTART:20261006T120000Z',
			'DTEND:20261006T130000Z'
		]),
		event([
			'UID:repro-3',
			'SUMMARY:All day',
			'DTSTART;VALUE=DATE:20261008',
			'DTEND;VALUE=DATE:20261009'
		]),
		event([
			'UID:repro-4',
			'SUMMARY:Weekly until',
			'DTSTART;TZID=E. Africa Standard Time:20261005T130000',
			'DTEND;TZID=E. Africa Standard Time:20261005T133000',
			'RRULE:FREQ=WEEKLY;UNTIL=20261019T100000Z;BYDAY=MO'
		])
	);
	const found = eventsBetween(feed, FROM, TO, NAIROBI);
	const at = (summary: string) =>
		found.filter((e) => e.summary === summary).map((e) => `${e.start} ${e.end}`);

	test('a Windows TZID is read and drawn in the account’s zone', () => {
		expect(at('Eastern 09:00 meeting')).toEqual(['2026-10-06T16:00 2026-10-06T17:00']);
	});

	test('a UTC stamp is drawn in the account’s zone, not the server’s', () => {
		expect(at('UTC 12:00 meeting')).toEqual(['2026-10-06T15:00 2026-10-06T16:00']);
	});

	test('an all-day event keeps its date', () => {
		expect(at('All day')).toEqual(['2026-10-08T00:00 2026-10-09T00:00']);
	});

	test('UNTIL keeps the occurrence it lands on', () => {
		expect(at('Weekly until')).toEqual([
			'2026-10-05T13:00 2026-10-05T13:30',
			'2026-10-12T13:00 2026-10-12T13:30',
			'2026-10-19T13:00 2026-10-19T13:30'
		]);
	});

	test('a weekly meeting stays at its own nine across its own DST change', () => {
		// New York leaves DST on 1 Nov 2026: 09:00 EDT is 16:00 in Nairobi,
		// 09:00 EST is 17:00.
		const found = eventsBetween(
			ics(
				event([
					'UID:dst',
					'SUMMARY:Sync',
					'DTSTART;TZID=America/New_York:20261026T090000',
					'RRULE:FREQ=WEEKLY'
				])
			),
			new Date(2026, 9, 26),
			new Date(2026, 10, 9),
			NAIROBI
		);
		expect(found.map((e) => e.start)).toEqual(['2026-10-26T16:00', '2026-11-02T17:00']);
	});

	test('an EXDATE and a RECURRENCE-ID in the series’ zone match its own days', () => {
		const found = eventsBetween(
			ics(
				event([
					'UID:s',
					'SUMMARY:Late call',
					// 20:00 in New York is 03:00 the next day in Nairobi.
					'DTSTART;TZID=Eastern Standard Time:20261005T200000',
					'RRULE:FREQ=DAILY;COUNT=3',
					'EXDATE;TZID=Eastern Standard Time:20261006T200000'
				]),
				event([
					'UID:s',
					'SUMMARY:Late call, moved',
					'RECURRENCE-ID;TZID=Eastern Standard Time:20261007T200000',
					'DTSTART;TZID=Eastern Standard Time:20261007T180000'
				])
			),
			FROM,
			TO,
			NAIROBI
		);
		expect(found.map((e) => `${e.start} ${e.summary}`)).toEqual([
			'2026-10-06T03:00 Late call',
			'2026-10-08T01:00 Late call, moved'
		]);
	});

	test('a vendor-prefixed IANA name is read', () => {
		const [only] = eventsBetween(
			ics(
				event([
					'UID:moz',
					'SUMMARY:Berlin',
					'DTSTART;TZID=/mozilla.org/20050126_1/Europe/Berlin:20261006T090000'
				])
			),
			FROM,
			TO,
			NAIROBI
		);
		expect(only.start).toBe('2026-10-06T10:00');
	});

	test('a TZID it cannot read is skipped rather than drawn at the wrong hour', () => {
		expect(
			eventsBetween(
				ics(
					event(['UID:x', 'SUMMARY:Where', 'DTSTART;TZID=Nowhere Standard Time:20261006T090000'])
				),
				FROM,
				TO,
				NAIROBI
			)
		).toEqual([]);
	});
});
