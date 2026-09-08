/**
 * A reminder is a time, and being told at ten past is being told late.
 *
 * The clock replaces a timer that asked once a minute — correct, and up to
 * fifty-nine seconds late every time. What has to hold is that it fires at the
 * moment a reminder says, that a reminder created after it went to sleep
 * cannot be missed, and that it never sleeps so long that a write nobody
 * announced strands one for hours.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	clock: typeof import('../src/lib/server/services/reminder-clock');
	reminders: typeof import('../src/lib/server/services/reminders');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	s = {
		clock: await import('../src/lib/server/services/reminder-clock'),
		reminders: await import('../src/lib/server/services/reminders')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-24T09:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('when the next reminder falls due', () => {
	test('nothing set means nothing to wait for', () => {
		expect(s.clock.nextDueAt(new Date('2026-08-24T09:00:00Z'))).toBeNull();
	});

	test('an alarm is due at the second it names, not the minute after', () => {
		s.reminders.createFreeReminder(ctx, {
			at: '2026-08-24T15:30:45',
			message: 'take the bread out'
		});

		const next = s.clock.nextDueAt(new Date('2026-08-24T09:00:00Z'));
		expect(next?.toISOString()).toBe('2026-08-24T15:30:45.000Z');
	});

	test('one set for earlier moves the answer, which is the whole problem', () => {
		// The failure the design exists for: asleep until 15:30, somebody sets
		// something for 14:10, and a clock that only ever asked once wakes an
		// hour and twenty minutes late.
		s.reminders.createFreeReminder(ctx, { at: '2026-08-24T14:10:00', message: 'ring the bank' });

		const next = s.clock.nextDueAt(new Date('2026-08-24T09:00:00Z'));
		expect(next?.toISOString()).toBe('2026-08-24T14:10:00.000Z');
	});

	test('somebody else’s reminder counts, because the clock is the instance’s', () => {
		s.reminders.createFreeReminder(theirs, { at: '2026-08-24T10:05:00', message: 'not yours' });

		const next = s.clock.nextDueAt(new Date('2026-08-24T09:00:00Z'));
		expect(next?.toISOString()).toBe('2026-08-24T10:05:00.000Z');
	});

	test('and one already past is due now rather than never', () => {
		const next = s.clock.nextDueAt(new Date('2026-08-24T20:00:00Z'));
		expect(next).not.toBeNull();
		expect(next!.getTime()).toBeLessThan(new Date('2026-08-24T20:00:00Z').getTime());
	});

	test('nothing beyond the horizon is waited for', () => {
		// A reminder next month must not make the clock compute a month-long
		// sleep; the ceiling is what keeps that from mattering either way.
		s.reminders.createFreeReminder(ctx, { at: '2026-09-30T08:00:00', message: 'far away' });
		const next = s.clock.nextDueAt(new Date('2026-08-24T09:00:00Z'));
		expect(next?.toISOString()).toBe('2026-08-24T10:05:00.000Z');
	});

	test('it never means to sleep longer than a minute', () => {
		// The belt: a write path that forgets to wake it costs a minute, not the
		// hours until whatever it was waiting for. Also what covers a machine
		// suspending and a clock being stepped.
		expect(s.clock.MAX_SLEEP_MS).toBeLessThanOrEqual(60_000);
	});
});

describe('an alarm', () => {
	test('is about nothing, and says so', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-08-25T07:00:00',
			message: 'wake up'
		});
		const mine = s.reminders.listReminders(ctx).find((r) => r.id === id);
		expect(mine?.subjectKind).toBe('free');
		expect(mine?.message).toBe('wake up');
	});

	test('refuses something that is not a time', () => {
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: 'tomorrow-ish', message: 'no' })
		).toThrow();
	});

	test('can be taken back, which is the other half of setting one', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-08-26T07:00:00',
			message: 'temporary'
		});
		expect(s.reminders.deleteReminder(ctx, id)).toBe(true);
		expect(s.reminders.listReminders(ctx).some((r) => r.id === id)).toBe(false);
	});

	test("and cannot be taken back from somebody else's account", () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-08-27T07:00:00',
			message: 'mine'
		});
		expect(s.reminders.deleteReminder(theirs, id)).toBe(false);
		expect(s.reminders.listReminders(ctx).some((r) => r.id === id)).toBe(true);
	});
});
