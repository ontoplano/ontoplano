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
