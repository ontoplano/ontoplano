/**
 * Calendars somebody else controls.
 *
 * The address is user-supplied and the *server* fetches it, which is the exact
 * shape of a request-forgery hole — so most of this is about what is refused.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
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

/**
 * A feed that stops answering must say so on the page rather than take the
 * planner down with it, and the last good copy has to keep being drawn while it
 * is broken. Every fetch here is stubbed: the suite makes no network request,
 * which is also the only way to reproduce a calendar that is down.
 */
describe('fetching one', () => {
	const ICS = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'BEGIN:VEVENT',
		'UID:fetched-1',
		'SUMMARY:Fetched meeting',
		'DTSTART:20260819T140000',
		'DTEND:20260819T150000',
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');

	function respondWith(body: string, init: { ok?: boolean; status?: number } = {}) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: init.ok ?? true,
				status: init.status ?? 200,
				text: async () => body
			}))
		);
	}

	/** What the page would show for this feed. */
	function feedRow(id: number) {
		return s.calendars.listFeeds(ctx).find((f) => f.id === id)!;
	}

	/** Whether the last good copy is still being drawn. */
	function drawsSomething(id: number) {
		return s.calendars
			.subscribedEvents(ctx, new Date('2026-08-17'), new Date('2026-08-24'))
			.some((e) => e.feedId === id);
	}

	afterEach(() => vi.unstubAllGlobals());

	test('keeps what it was given and clears the last complaint', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'Good', url: 'https://example.com/good.ics' });
		respondWith(ICS);

		await s.calendars.refreshFeed(ctx, id);

		expect(feedRow(id).lastError).toBeNull();
		expect(feedRow(id).fetchedAt).toBeTruthy();
		expect(drawsSomething(id)).toBe(true);
	});

	test('records what went wrong instead of throwing', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'Gone', url: 'https://example.com/gone.ics' });
		respondWith('', { ok: false, status: 404 });

		await expect(s.calendars.refreshFeed(ctx, id)).resolves.toBeUndefined();
		expect(feedRow(id).lastError).toContain('404');
	});

	test('refuses an address that answers with something that is not a calendar', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'HTML', url: 'https://example.com/page.ics' });
		respondWith('<!doctype html><title>Sign in</title>');

		await s.calendars.refreshFeed(ctx, id);
		expect(feedRow(id).lastError).toMatch(/not a calendar/);
	});

	test('and one that answers with far too much', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'Huge', url: 'https://example.com/huge.ics' });
		respondWith('BEGIN:VCALENDAR'.padEnd(20_000_000, 'x'));

		await s.calendars.refreshFeed(ctx, id);
		expect(feedRow(id).lastError).toMatch(/too large/);
	});

	test('keeps drawing the last good copy while it is broken', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'Flaky', url: 'https://example.com/flaky.ics' });
		respondWith(ICS);
		await s.calendars.refreshFeed(ctx, id);

		respondWith('', { ok: false, status: 500 });
		await s.calendars.refreshFeed(ctx, id);

		expect(feedRow(id).lastError).toContain('500');
		// The page says it is broken and still draws last week's copy.
		expect(drawsSomething(id)).toBe(true);
	});

	test('a network that simply fails is still only a note on the row', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'Down', url: 'https://example.com/down.ics' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('getaddrinfo ENOTFOUND');
			})
		);

		await s.calendars.refreshFeed(ctx, id);
		expect(feedRow(id).lastError).toContain('ENOTFOUND');
	});

	test("is refused for a calendar that is not this account's", async () => {
		const mine = s.calendars.listFeeds(ctx)[0];
		const fetched = vi.fn();
		vi.stubGlobal('fetch', fetched);

		await expect(s.calendars.refreshFeed(theirs, mine.id)).rejects.toThrow();
		// And nothing was fetched on their behalf, which is the point: the URL
		// is somebody else's and the server is the one making the request.
		expect(fetched).not.toHaveBeenCalled();
	});

	test('a sweep only refetches what has gone stale', async () => {
		const id = s.calendars.addFeed(ctx, { name: 'Fresh', url: 'https://example.com/fresh.ics' });
		respondWith(ICS);
		await s.calendars.refreshFeed(ctx, id);

		const fetched = vi.fn(async () => ({ ok: true, status: 200, text: async () => ICS }));
		vi.stubGlobal('fetch', fetched);

		// A minute later everything is still fresh…
		await s.calendars.refreshStale({ ...ctx, now: new Date('2026-08-17T09:01:00') });
		const afterFresh = fetched.mock.calls.length;

		// …and a day later it is not.
		await s.calendars.refreshStale({ ...ctx, now: new Date('2026-08-18T09:00:00') });
		expect(fetched.mock.calls.length).toBeGreaterThan(afterFresh);
	});
});
