import { describe, expect, test } from 'vitest';
import {
	dateOf,
	dayOf,
	isClock,
	agoOf,
	momentOf,
	monthOf,
	timeOf,
	wantsTwelveHour,
	weekdayOf,
	type When
} from '../src/lib/when';

/**
 * How a moment is written down.
 *
 * Two things are worth pinning. The clock, because it is the thing somebody
 * asked for and the thing that was scattered across thirty-seven call sites.
 * And the zone — specifically the difference between an instant, which is a
 * point on the timeline and moves with the reader, and a wall-clock time,
 * which is six in the evening wherever you are and must not be shifted by
 * anything.
 */
const sao = (clock: When['clock'] = 'auto'): When => ({
	locale: 'pt-BR',
	tz: 'America/Sao_Paulo',
	clock
});
const london = (clock: When['clock'] = 'auto'): When => ({
	locale: 'en',
	tz: 'Europe/London',
	clock
});

describe('which clock', () => {
	test('auto is whatever the language does', () => {
		// English says four in the afternoon; Portuguese says sixteen.
		expect(timeOf('2026-01-01T16:00', london())).toMatch(/4/);
		expect(timeOf('2026-01-01T16:00', sao())).toMatch(/16/);
	});

	test('a person can overrule their language, both ways', () => {
		expect(timeOf('2026-01-01T16:00', london('24'))).toBe('16:00');
		expect(timeOf('2026-01-01T16:00', sao('12'))).toMatch(/4/);
	});

	test('the answer is the same one the non-Intl things are told', () => {
		expect(wantsTwelveHour(london('24'))).toBe(false);
		expect(wantsTwelveHour(sao('12'))).toBe(true);
		// On auto it defers, and the two languages disagree — which is the point.
		expect(wantsTwelveHour(london())).toBe(true);
		expect(wantsTwelveHour(sao())).toBe(false);
	});

	test('only the three answers are answers', () => {
		expect(isClock('auto')).toBe(true);
		expect(isClock('12')).toBe(true);
		expect(isClock('24')).toBe(true);
		expect(isClock('twelve')).toBe(false);
		expect(isClock(12)).toBe(false);
		expect(isClock(undefined)).toBe(false);
	});
});

describe('which zone', () => {
	/*
	 * The bug this distinction exists to prevent: "Gym at 18:00 on Thursday"
	 * is a wall-clock time. Read as UTC and rendered in São Paulo it becomes
	 * 15:00, which is a different plan.
	 */
	test('a wall-clock time is not shifted by the reader s zone', () => {
		expect(timeOf('2026-06-11T18:00', sao('24'))).toBe('18:00');
		expect(timeOf('2026-06-11T18:00', london('24'))).toBe('18:00');
	});

	test('an instant is shifted, because that is what an instant means', () => {
		// 21:00 UTC is 18:00 in São Paulo (UTC-3) and 22:00 in London (BST).
		const instant = '2026-06-11T21:00:00Z';
		expect(timeOf(instant, sao('24'))).toBe('18:00');
		expect(timeOf(instant, london('24'))).toBe('22:00');
	});

	test('a Date is an instant too', () => {
		expect(timeOf(new Date('2026-06-11T21:00:00Z'), sao('24'))).toBe('18:00');
	});

	test('a bare day is the day, in any zone', () => {
		// Not "the day before" because midnight moved backwards over a border.
		expect(dayOf('2026-06-11', sao())).toMatch(/11/);
		expect(dayOf('2026-06-11', london())).toMatch(/11/);
	});
});

describe('the shapes', () => {
	test('a day, a date and a moment say progressively more', () => {
		const at = '2026-06-11T18:05';
		expect(dayOf(at, london())).not.toMatch(/2026/);
		expect(dateOf(at, london())).toMatch(/2026/);
		expect(momentOf(at, london('24'))).toMatch(/2026/);
		expect(momentOf(at, london('24'))).toMatch(/18:05/);
	});

	test('a weekday is a weekday', () => {
		// 11 June 2026 is a Thursday.
		expect(weekdayOf('2026-06-11', london())).toMatch(/Thu/);
	});

	test('a month key becomes a month name, in any zone', () => {
		// The fifteenth at noon UTC is far enough from both edges that no zone
		// can push it into a neighbouring month — which is the whole point.
		expect(monthOf('2026-01', london())).toMatch(/Jan/);
		expect(monthOf('2026-01', sao())).toMatch(/jan/i);
		expect(monthOf('2026-12', london())).toMatch(/Dec/);
		expect(monthOf('nonsense', london())).toBe('');
	});

	test('how long ago, in the largest unit that is still true', () => {
		const now = new Date('2026-06-11T12:00:00Z');
		const ago = (iso: string) => agoOf(iso, london(), now);

		expect(ago('2026-06-11T09:00:00Z')).toMatch(/3 hours ago/);
		// Ninety minutes is an hour ago: the point is the distance, not the
		// arithmetic.
		expect(ago('2026-06-11T10:30:00Z')).toMatch(/1 hour ago/);
		expect(ago('2026-06-10T12:00:00Z')).toMatch(/yesterday/i);
		expect(ago('2026-06-11T11:59:30Z')).toMatch(/30 seconds ago/);
		// And it reads the other way for something still to come.
		expect(ago('2026-06-11T15:00:00Z')).toMatch(/in 3 hours/);
	});

	test('something that is not a date at all renders as nothing', () => {
		// Better a gap than "Invalid Date" printed into somebody's diary.
		expect(timeOf('not a time', london())).toBe('');
		expect(dateOf('', london())).toBe('');
	});
});
