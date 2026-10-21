import { describe, expect, test } from 'vitest';
import type { Ctx } from './ctx.js';
import { localDay, startOfToday } from './time.js';

/**
 * Today is the person's today. At 23:25 in São Paulo it is already the next
 * day in UTC, which is the server's clock, and the dashboard said so.
 */
describe('startOfToday', () => {
	const at = (now: string, tz: string): Ctx => ({ userId: 'u', tz, now: new Date(now) });

	test('three hours west, after nine in the evening, is still today', () => {
		expect(localDay(startOfToday(at('2026-10-17T02:25:00Z', 'America/Sao_Paulo')))).toBe(
			'2026-10-16'
		);
	});

	test('and turns over at their midnight, not the server’s', () => {
		expect(localDay(startOfToday(at('2026-10-17T03:00:00Z', 'America/Sao_Paulo')))).toBe(
			'2026-10-17'
		);
	});

	test('east of Greenwich, the day starts before UTC’s does', () => {
		expect(localDay(startOfToday(at('2026-10-16T22:30:00Z', 'Asia/Tokyo')))).toBe('2026-10-17');
	});
});
