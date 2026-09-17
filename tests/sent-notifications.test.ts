import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * What the app has said, kept so it can be read again.
 *
 * A push happens once and is gone the moment a lock screen is cleared, so
 * "what did it tell me while I was out" had no answer. These are the rules
 * that make the answer trustworthy: the count means what a badge claims it
 * means, reading is one-way, and one account never sees another's.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let sent: typeof import('../src/lib/services/sent-notifications');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

beforeAll(async () => {
	sent = await import('../src/lib/services/sent-notifications');
	({ buildCtx } = await import('../src/lib/services/ctx'));
});

const ctx = () => buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });
const other = () => buildCtx(STRANGER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });

describe('the list', () => {
	it('keeps what was said, newest first', () => {
		sent.record(OWNER, { title: 'first', body: 'one', kind: 'reminder' });
		sent.record(OWNER, { title: 'second', url: '/tasks', kind: 'reminder' });

		const held = sent.list(ctx());
		expect(held[0].title).toBe('second');
		expect(held[0].url).toBe('/tasks');
		expect(held[1].title).toBe('first');
		expect(held[1].body).toBe('one');
	});

	it('trims a title nobody could read in a menu', () => {
		const one = sent.record(OWNER, { title: 'x'.repeat(500), body: 'y'.repeat(4000) });
		expect(one.title.length).toBeLessThanOrEqual(200);
		expect(one.body.length).toBeLessThanOrEqual(1000);
	});

	it('does not grow without end', () => {
		const mine = buildCtx(STRANGER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });
		for (let n = 0; n < sent.KEPT_PER_ACCOUNT + 25; n++) {
			sent.record(STRANGER, { title: `one ${n}` });
		}
		const held = sent.list(mine, sent.KEPT_PER_ACCOUNT);
		expect(held.length).toBe(sent.KEPT_PER_ACCOUNT);
		// The oldest went, not the newest.
		expect(held[0].title).toBe(`one ${sent.KEPT_PER_ACCOUNT + 24}`);
	});
});

describe('what the badge counts', () => {
	it('is everything not yet read', () => {
		const before = sent.unreadCount(ctx());
		sent.record(OWNER, { title: 'unread one' });
		expect(sent.unreadCount(ctx())).toBe(before + 1);
	});

	it('falls when one is read, and stays there when it is read again', () => {
		const one = sent.record(OWNER, { title: 'to be read' });
		const before = sent.unreadCount(ctx());

		sent.markRead(ctx(), one.id);
		const after = sent.unreadCount(ctx());
		expect(after).toBe(before - 1);

		// Reading it twice is not reading two things.
		sent.markRead(ctx(), one.id);
		expect(sent.unreadCount(ctx())).toBe(after);
	});

	it('goes to nothing when the list is opened', () => {
		sent.record(OWNER, { title: 'a' });
		sent.record(OWNER, { title: 'b' });
		expect(sent.unreadCount(ctx())).toBeGreaterThan(0);

		sent.markAllRead(ctx());
		expect(sent.unreadCount(ctx())).toBe(0);
	});

	it('keeps the moment it was first seen', () => {
		const one = sent.record(OWNER, { title: 'timed' });
		sent.markRead(buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T11:00:00Z') }), one.id);
		const first = sent.list(ctx()).find((n) => n.id === one.id)?.readAt;

		sent.markRead(buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-15T09:00:00Z') }), one.id);
		expect(sent.list(ctx()).find((n) => n.id === one.id)?.readAt).toBe(first);
	});
});

describe('whose it is', () => {
	it('is never another account’s to see or to read', () => {
		const mine = sent.record(OWNER, { title: 'mine alone' });

		expect(sent.list(other(), 200).some((n) => n.id === mine.id)).toBe(false);
		expect(() => sent.markRead(other(), mine.id)).toThrow();

		// Still unread, because nobody who may read it has.
		expect(sent.list(ctx()).find((n) => n.id === mine.id)?.readAt).toBe(null);
	});

	it('marks only its own account read', () => {
		sent.record(OWNER, { title: 'ours' });
		sent.record(STRANGER, { title: 'theirs' });
		const theirs = sent.unreadCount(other());

		sent.markAllRead(ctx());
		expect(sent.unreadCount(ctx())).toBe(0);
		expect(sent.unreadCount(other())).toBe(theirs);
	});
});
