/**
 * Publishing the plan as a calendar.
 *
 * The strong test here is the round trip: this file generates a feed and then
 * reads it back with `ics.ts`, the parser the app already uses on other
 * people's calendars. A generator checked only against its own idea of the
 * format passes while emitting something no client accepts; one checked against
 * a parser written months earlier, for the opposite job, has to produce
 * something that is actually iCalendar.
 *
 * The rest is the two things that go wrong in the field and are invisible in a
 * developer's own calendar: identities that change between fetches, which
 * duplicates somebody's week on every refresh instead of updating it, and
 * escaping, where one stray comma in a note silently drops the event.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eventsBetween } from '../src/lib/ics';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let feed: typeof import('../src/lib/server/services/calendar-feed');
let slots: typeof import('../src/lib/server/services/slots');
let activities: typeof import('../src/lib/server/services/activities');
let ctx: { userId: string; now: Date; tz: string };
let work: number;

/** A Monday, so weekday 0 is the day the clock says it is. */
const MONDAY = new Date('2026-08-17T08:00:00');

beforeAll(async () => {
	feed = await import('../src/lib/server/services/calendar-feed');
	slots = await import('../src/lib/server/services/slots');
	activities = await import('../src/lib/server/services/activities');
	ctx = { userId: OWNER, now: MONDAY, tz: 'UTC' };

	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
	const deep = activities.createActivity(ctx, { name: 'Deep work', categoryId: work });

	slots.createSlot(ctx, {
		weekday: 0,
		startTime: '09:00',
		durationMinutes: 90,
		mode: 'activity',
		activityId: deep
	});
});

function build() {
	return feed.buildFeed(ctx, { host: 'plan.example.com', calendarName: 'Ontoplano' });
}

describe('the bytes a calendar client is handed', () => {
	test('are a calendar, opened and closed', () => {
		const text = build();
		expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(text).toContain('VERSION:2.0');
		expect(text).toContain('PRODID:-//ontoplano//plan//EN');
	});

	test('are CRLF throughout, which the strict clients mean', () => {
		// Outlook among them. A lone \n is the classic "works everywhere except
		// the one place it has to".
		const text = build();
		expect(text.replace(/\r\n/g, '')).not.toContain('\n');
	});

	test('name themselves, so a subscription is not "untitled"', () => {
		// Not in RFC 5545, read by every client. A feed nobody can tell apart
		// from their others is a feed they turn off.
		expect(build()).toContain('X-WR-CALNAME:Ontoplano');
	});

	test('and say how often to come back', () => {
		const text = build();
		expect(text).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
		expect(text).toContain('X-PUBLISHED-TTL:PT1H');
	});
});

describe('read back by the parser the app already uses', () => {
	/** The generator's output, through `ics.ts` — the round trip. */
	function parsed(from = '2026-08-17', to = '2026-08-24') {
		return eventsBetween(build(), new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`));
	}

	test('a weekly block comes back at the time it was put at', () => {
		const monday = parsed().find((e) => e.start.startsWith('2026-08-17'));

		expect(monday).toBeTruthy();
		expect(monday!.summary).toBe('Deep work');
		expect(monday!.start).toBe('2026-08-17T09:00');
		// 90 minutes later, which is the other half of "at the right time".
		expect(monday!.end).toBe('2026-08-17T10:30');
	});

	test('and comes back on every week in the window, not just the first', () => {
		const mondays = eventsBetween(
			build(),
			new Date('2026-08-17T00:00:00'),
			new Date('2026-09-15T00:00:00')
		).filter((e) => e.summary === 'Deep work');

		// The feed expands occurrences rather than emitting a rule, so four weeks
		// of window means four of them.
		expect(mondays.length).toBeGreaterThanOrEqual(4);
	});

	test('a one-off comes back once, on its own day', () => {
		slots.createExceptional(ctx, {
			date: '2026-08-19',
			startTime: '14:00',
			durationMinutes: 45,
			mode: 'category',
			categoryId: work,
			label: 'Dentist'
		});

		const found = parsed().filter((e) => e.summary === 'Dentist');
		expect(found).toHaveLength(1);
		expect(found[0].start).toBe('2026-08-19T14:00');
	});
});

describe('an identity that survives being fetched again', () => {
	test('is the same on two generations of the same feed', () => {
		// A client that sees a new UID for the same block treats it as a
		// different event — so unstable ids duplicate the week on every refresh
		// instead of updating it. This is the whole reason UIDs are computed from
		// the block and its date rather than generated.
		const uids = (text: string) =>
			text
				.split('\r\n')
				.filter((l) => l.startsWith('UID:'))
				.sort();

		expect(uids(build())).toEqual(uids(build()));
		expect(uids(build()).length).toBeGreaterThan(0);
	});

	test('and is unique within one feed', () => {
		const uids = build()
			.split('\r\n')
			.filter((l) => l.startsWith('UID:'));
		expect(new Set(uids).size).toBe(uids.length);
	});

	test('carrying the host, as the format asks', () => {
		expect(build()).toMatch(/UID:[^\r\n]+@plan\.example\.com/);
	});
});

describe('text somebody typed', () => {
	test('survives the commas and semicolons that would end the line', () => {
		// An unescaped comma turns one value into two and the stricter clients
		// drop the event rather than guess.
		slots.createExceptional(ctx, {
			date: '2026-08-20',
			startTime: '10:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'Buy milk, bread; and eggs'
		});

		const text = build();
		expect(text).toContain('Buy milk\\, bread\\; and eggs');

		const [event] = eventsBetween(
			text,
			new Date('2026-08-20T00:00:00'),
			new Date('2026-08-21T00:00:00')
		).filter((e) => e.summary.startsWith('Buy milk'));
		expect(event.summary).toBe('Buy milk, bread; and eggs');
	});

	test('and a backslash is escaped before everything else', () => {
		// Escape the escapes last and they get escaped again by the earlier ones.
		slots.createExceptional(ctx, {
			date: '2026-08-21',
			startTime: '10:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'a\\b'
		});
		expect(build()).toContain('a\\\\b');
	});

	test('a long line is folded, and unfolds to what was written', () => {
		const long = 'A block with a deliberately long name '.repeat(4).trim();
		slots.createExceptional(ctx, {
			date: '2026-08-22',
			startTime: '10:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: long
		});

		const text = build();
		// Nothing over 75 octets, which is the limit the format states.
		for (const line of text.split('\r\n')) {
			expect(Buffer.from(line, 'utf8').length, line.slice(0, 40)).toBeLessThanOrEqual(75);
		}

		const [event] = eventsBetween(
			text,
			new Date('2026-08-22T00:00:00'),
			new Date('2026-08-23T00:00:00')
		).filter((e) => e.summary.startsWith('A block with'));
		expect(event.summary).toBe(long);
	});

	test('and folding never splits a character in half', () => {
		// The limit is octets, so a name with accents in it folds at a different
		// character than a plain one — and a fold through the middle of a
		// multi-byte character is mojibake at best and a dropped event at worst.
		slots.createExceptional(ctx, {
			date: '2026-08-23',
			startTime: '10:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'Reunião com o Estevão sobre a próxima versão do aplicativo — coisas '.repeat(2).trim()
		});

		const text = build();
		expect(text).not.toContain('�');

		const [event] = eventsBetween(
			text,
			new Date('2026-08-23T00:00:00'),
			new Date('2026-08-24T00:00:00')
		).filter((e) => e.summary.startsWith('Reunião'));
		expect(event.summary).toContain('próxima versão');
	});
});

describe('what the feed carries besides the time', () => {
	test('the category, so a client that colours by it can', () => {
		expect(build()).toContain('CATEGORIES:Work');
	});

	test('and nothing belonging to another account', () => {
		const theirs = feed.buildFeed(
			{ userId: STRANGER, now: MONDAY, tz: 'UTC' },
			{ host: 'plan.example.com' }
		);

		expect(theirs).toContain('BEGIN:VCALENDAR');
		expect(theirs).not.toContain('Deep work');
		expect(theirs).not.toContain('Dentist');
	});
});
