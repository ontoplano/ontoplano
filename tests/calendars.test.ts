/**
 * Calendars somebody else controls.
 *
 * The address is user-supplied and the *server* fetches it, which is the exact
 * shape of a request-forgery hole — so most of this is about what is refused.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = { calendars: typeof import('../src/lib/server/services/calendars') };

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	s = { calendars: await import('../src/lib/server/services/calendars') };
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('what address is accepted', () => {
	test('a public https one', () => {
		const id = s.calendars.addFeed(ctx, {
			name: 'Work',
			url: 'https://calendar.google.com/calendar/ical/x/basic.ics'
		});
		expect(s.calendars.listFeeds(ctx).find((f) => f.id === id)?.name).toBe('Work');
	});

	test('webcal:// is https underneath', () => {
		const id = s.calendars.addFeed(ctx, { name: 'Phone', url: 'webcal://example.com/cal.ics' });
		expect(s.calendars.listFeeds(ctx).find((f) => f.id === id)?.url).toMatch(/^https:\/\//);
	});

	test('anything pointing back at this machine is refused', () => {
		for (const url of [
			'http://localhost:1493/private.ics',
			'http://127.0.0.1/cal.ics',
			'http://10.0.0.5/cal.ics',
			'http://192.168.1.50:1493/cal.ics',
			'http://172.16.4.4/cal.ics',
			'http://169.254.169.254/latest/meta-data',
			'http://box.internal/cal.ics'
		]) {
			expect(() => s.calendars.addFeed(ctx, { name: 'Bad', url }), url).toThrow();
		}
	});

	test('a protocol that is not the web is refused', () => {
		expect(() => s.calendars.addFeed(ctx, { name: 'Bad', url: 'file:///etc/passwd' })).toThrow();
		expect(() => s.calendars.addFeed(ctx, { name: 'Bad', url: 'gopher://x/cal' })).toThrow();
	});

	test('nonsense is refused', () => {
		expect(() => s.calendars.addFeed(ctx, { name: 'Bad', url: 'not a url' })).toThrow();
		expect(() => s.calendars.addFeed(ctx, { name: 'Bad', url: '' })).toThrow();
	});
});

describe('drawing what it holds', () => {
	test('nothing is drawn until something has been fetched', () => {
		expect(
			s.calendars.subscribedEvents(ctx, new Date('2026-08-17'), new Date('2026-08-24'))
		).toEqual([]);
	});

	test('events carry the calendar they came from, and its colour', () => {
		const id = s.calendars.addFeed(ctx, {
			name: 'Team',
			url: 'https://example.com/team.ics',
			color: '#9d174d'
		});

		// The fetch is the network's job; this puts a body in as though it ran.
		database.exec(
			'update calendar_feeds set body = ?, fetched_at = ? where id = ?',
			[
				'BEGIN:VCALENDAR',
				'BEGIN:VEVENT',
				'UID:1',
				'SUMMARY:Sprint review',
				'DTSTART:20260819T140000',
				'DTEND:20260819T150000',
				'END:VEVENT',
				'END:VCALENDAR'
			].join('\r\n'),
			'2026-08-17T09:00:00',
			id
		);

		const [only] = s.calendars.subscribedEvents(
			ctx,
			new Date('2026-08-17'),
			new Date('2026-08-24')
		);
		expect(only.summary).toBe('Sprint review');
		expect(only.feedName).toBe('Team');
		expect(only.color).toBe('#9d174d');
	});

	test('another account sees none of it', () => {
		expect(s.calendars.listFeeds(theirs)).toEqual([]);
		expect(
			s.calendars.subscribedEvents(theirs, new Date('2026-08-17'), new Date('2026-08-24'))
		).toEqual([]);
	});

	test('a stranger cannot remove one', () => {
		const mine = s.calendars.listFeeds(ctx)[0];
		expect(s.calendars.removeFeed(theirs, mine.id)).toBe(false);
		expect(s.calendars.listFeeds(ctx).some((f) => f.id === mine.id)).toBe(true);
	});
});
