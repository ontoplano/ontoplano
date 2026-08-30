/**
 * Habits, and the streak arithmetic that is easy to get almost right.
 *
 * Two kinds of streak, counted in opposite directions: a good habit counts
 * scheduled days you did it, walking backwards; a bad one counts the days
 * since you last slipped. And today missing must never break a good streak —
 * the day is not over yet, and an app that resets your count at midnight for a
 * thing you are about to do at nine is an app people delete.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let habits: typeof import('../src/lib/server/services/habits');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	habits = await import('../src/lib/server/services/habits');
	// A Monday, so weekday arithmetic in the schedule is easy to read.
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('keeping habits', () => {
	test('a habit is created with its type and its days', () => {
		const id = habits.createHabit(ctx, {
			name: 'read before bed',
			type: 'good',
			scheduledDays: '0,1,2,3,4',
			description: '20 minutes'
		});

		const habit = habits.listHabits(ctx).find((h) => h.id === id)!;
		expect(habit.name).toBe('read before bed');
		expect(habit.type).toBe('good');
		expect(habits.parseScheduledDays(habit.scheduledDays)).toEqual([0, 1, 2, 3, 4]);
	});

	test('an unknown type is refused rather than stored', () => {
		expect(() => habits.createHabit(ctx, { name: 'x', type: 'sideways' })).toThrow();
	});

	test('a nameless habit is refused', () => {
		expect(() => habits.createHabit(ctx, { name: '  ', type: 'good' })).toThrow();
	});

	test('another account cannot change or delete one', () => {
		const mine = habits.listHabits(ctx)[0];
		expect(() => habits.updateHabit(theirs, mine.id, { name: 'taken', type: 'bad' })).toThrow();
		expect(() => habits.deleteHabit(theirs, mine.id)).toThrow();
	});
});

describe('logging a day', () => {
	test('ticking twice is a tick and an untick, not two rows', () => {
		const id = habits.createHabit(ctx, { name: 'water', type: 'good' });

		habits.toggleOccurrence(ctx, { habitId: id, date: '2026-08-17' });
		expect(habits.listOccurrences(ctx).filter((o) => o.habitId === id)).toHaveLength(1);

		habits.toggleOccurrence(ctx, { habitId: id, date: '2026-08-17' });
		expect(habits.listOccurrences(ctx).filter((o) => o.habitId === id)).toHaveLength(0);
	});

	test('a day can carry a note', () => {
		const id = habits.createHabit(ctx, { name: 'walk', type: 'good' });
		habits.logOccurrence(ctx, { habitId: id, date: '2026-08-17', notes: 'along the river' });

		const logged = habits.listOccurrences(ctx).find((o) => o.habitId === id)!;
		expect(logged.notes).toBe('along the river');
	});

	test("another account's habit cannot be logged against", () => {
		const mine = habits.listHabits(ctx)[0];
		expect(() => habits.logOccurrence(theirs, { habitId: mine.id, date: '2026-08-17' })).toThrow();
	});
});

describe('the streak', () => {
	const good = { type: 'good', createdAt: '2026-08-01T09:00:00', scheduledDays: null };

	test('counts consecutive days backwards', () => {
		const done = [{ date: '2026-08-17' }, { date: '2026-08-16' }, { date: '2026-08-15' }];
		expect(habits.computeStreak(good, done, '2026-08-17')).toBe(3);
	});

	test('is not broken by today being blank — the day is not over', () => {
		const done = [{ date: '2026-08-16' }, { date: '2026-08-15' }];
		expect(habits.computeStreak(good, done, '2026-08-17')).toBe(2);
	});

	test('but is broken by a gap before today', () => {
		const done = [{ date: '2026-08-16' }, { date: '2026-08-14' }];
		expect(habits.computeStreak(good, done, '2026-08-17')).toBe(1);
	});

	test('skips the days the habit is not scheduled on', () => {
		// Weekdays only: the weekend is not a miss.
		const weekdays = { ...good, scheduledDays: '0,1,2,3,4' };
		const done = [{ date: '2026-08-17' }, { date: '2026-08-14' }, { date: '2026-08-13' }];
		expect(habits.computeStreak(weekdays, done, '2026-08-17')).toBe(3);
	});

	test('counts the other way for a bad habit — days since the last slip', () => {
		const bad = { type: 'bad', createdAt: '2026-08-01T09:00:00', scheduledDays: null };
		expect(habits.computeStreak(bad, [{ date: '2026-08-14' }], '2026-08-17')).toBe(3);
	});

	test('and a bad habit never slipped counts from the day it was made', () => {
		const bad = { type: 'bad', createdAt: '2026-08-10T09:00:00', scheduledDays: null };
		expect(habits.computeStreak(bad, [], '2026-08-17')).toBe(7);
	});
});

describe('which days a habit belongs to', () => {
	test('an unscheduled habit belongs to every day', () => {
		expect(habits.scheduledOn({ scheduledDays: null }, '2026-08-16')).toBe(true);
	});

	test('a scheduled one only to the days it names', () => {
		// 2026-08-17 is a Monday (0 in this app), 2026-08-16 a Sunday (6).
		expect(habits.scheduledOn({ scheduledDays: '0,1,2,3,4' }, '2026-08-17')).toBe(true);
		expect(habits.scheduledOn({ scheduledDays: '0,1,2,3,4' }, '2026-08-16')).toBe(false);
	});
});
