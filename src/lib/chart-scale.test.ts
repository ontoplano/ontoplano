import { describe, expect, it } from 'vitest';
import { compactMoney, niceTicks } from './chart-scale';

describe('niceTicks', () => {
	it('steps in ones, twos and fives, and ends at or above the peak', () => {
		const ticks = niceTicks(9_776_00);
		expect(ticks[0]).toBe(0);
		expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(9_776_00);
		const step = ticks[1];
		expect([1, 2, 5, 10]).toContain(step / 10 ** Math.floor(Math.log10(step)));
		expect(niceTicks(72_300)).toEqual([0, 20_000, 40_000, 60_000, 80_000]);
	});

	it('is one tick at nothing', () => {
		expect(niceTicks(0)).toEqual([0]);
	});
});

describe('compactMoney', () => {
	it('shortens and signs', () => {
		expect(compactMoney(1_000_000, 'USD', { locale: 'en-US' })).toBe('$10K');
		expect(compactMoney(-5_300, 'USD', { signed: true, locale: 'en-US' })).toBe('-$53');
		expect(compactMoney(570_000, 'USD', { signed: true, locale: 'en-US' })).toBe('+$5.7K');
	});
});
