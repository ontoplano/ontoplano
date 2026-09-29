import { describe, expect, it } from 'vitest';
import { floorOf, hasBeen, isTooSoon, soonest, type ReminderClock } from './reminder-clock';

const clock: ReminderClock = {
	today: '2026-09-29',
	now: '2026-09-29T14:07',
	dayStart: '08:00',
	leadMinutes: 15
};
const MINUTE = 60_000;

describe('the earliest a reminder may be', () => {
	it('is the lead ahead of now', () => {
		expect(floorOf(clock, 0)).toBe('2026-09-29T14:22');
	});

	it('moves on while the form sits open', () => {
		expect(floorOf(clock, 30 * MINUTE)).toBe('2026-09-29T14:52');
	});
});

describe('a time that has been', () => {
	it('is refused, and a day on its own means the hour the day starts', () => {
		expect(hasBeen(clock, 0, '2026-09-29', '13:00')).toBe(true);
		expect(hasBeen(clock, 0, '2026-09-29', '')).toBe(true);
		expect(hasBeen(clock, 0, '2026-09-30', '')).toBe(false);
	});

	it('says nothing before a day is chosen', () => {
		expect(hasBeen(clock, 0, '', '')).toBe(false);
	});
});

describe('a time too soon to ring', () => {
	it('is inside the lead', () => {
		expect(isTooSoon(clock, 0, '2026-09-29', '14:15')).toBe(true);
		expect(isTooSoon(clock, 0, '2026-09-29', '14:30')).toBe(false);
	});
});

describe('the suggested time', () => {
	it('is the next quarter hour at least a quarter away', () => {
		expect(soonest(clock, 0)).toBe('14:30');
	});

	it('stays on the day late at night', () => {
		expect(soonest({ ...clock, now: '2026-09-29T23:50' }, 0)).toBe('23:59');
	});
});
