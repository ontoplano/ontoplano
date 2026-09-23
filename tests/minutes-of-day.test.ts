/**
 * What time it is where the person is.
 *
 * `instant.getHours()` answers in the zone the Node process runs in, which on
 * the box is UTC. Every screen comparing "now" with a time somebody typed was
 * therefore out by their offset and said so with confidence: a block at 11:45
 * reported "7 hours left" to an account in São Paulo when the honest answer
 * was ten, and the dashboard's own card had rolled over to tomorrow while it
 * was still Sunday evening for the person reading it.
 *
 * The numbers below are that report, turned into a test.
 */
import { describe, expect, test } from 'vitest';

import { clockOfDay, localOfInstant, minutesOfDay } from '../src/lib/services/time';

/* 2026-09-21 01:28 UTC — which is still the 20th, at 22:28, in São Paulo. */
const LATE_SUNDAY = new Date('2026-09-21T01:28:00Z');

describe('minutes since midnight', () => {
	test('are counted where the person is, not where the server is', () => {
		expect(minutesOfDay(LATE_SUNDAY, 'UTC')).toBe(1 * 60 + 28);
		expect(minutesOfDay(LATE_SUNDAY, 'America/Sao_Paulo')).toBe(22 * 60 + 28);
		expect(minutesOfDay(LATE_SUNDAY, 'Asia/Tokyo')).toBe(10 * 60 + 28);
	});

	test('and the day they belong to is the person’s day', () => {
		// The report that started this: "today is still 20, sunday, in my
		// timezone. But there it shows 21 already."
		expect(localOfInstant(LATE_SUNDAY, 'UTC').slice(0, 10)).toBe('2026-09-21');
		expect(localOfInstant(LATE_SUNDAY, 'America/Sao_Paulo').slice(0, 10)).toBe('2026-09-20');
	});

	test('so a countdown to a time on the clock is right', () => {
		const block = 11 * 60 + 45;

		// 12:28 UTC is 09:28 in São Paulo, so the block is two and a bit hours
		// away. Counted in UTC it would be minus one — a block this morning
		// reported as already gone.
		const here = new Date('2026-09-22T12:28:00Z');
		expect(Math.round((block - minutesOfDay(here, 'America/Sao_Paulo')) / 60)).toBe(2);
		expect(Math.round((block - minutesOfDay(here, 'UTC')) / 60)).toBe(-1);

		// And the shape of the screenshot: late on Sunday evening, the block is
		// most of a day away rather than most of a day plus the offset.
		const away = block - minutesOfDay(LATE_SUNDAY, 'America/Sao_Paulo') + 24 * 60;
		expect(Math.round(away / 60)).toBe(13);
	});

	test('the clock helper agrees with the minutes one', () => {
		for (const tz of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo', 'Europe/Berlin']) {
			const { hour, minute } = clockOfDay(LATE_SUNDAY, tz);
			expect(hour * 60 + minute).toBe(minutesOfDay(LATE_SUNDAY, tz));
		}
	});

	test('and a zone with a half-hour offset is not rounded away', () => {
		expect(minutesOfDay(LATE_SUNDAY, 'Asia/Kolkata')).toBe(6 * 60 + 58);
	});
});
