import { describe, expect, it } from 'vitest';

import { PAGE_TURN_DEFAULTS, PAGE_TURN_RANGES } from '../src/lib/page-turn';

/**
 * The dissolve's numbers are decided by watching it on a real phone and then
 * edited in `page-turn.ts`. There was a screen with sliders that turned them
 * while the app ran; it is gone — three numbers in one file do not need a
 * page. What is worth checking without a browser is that each one is inside
 * the range that file says is sane, because a default outside its own range is
 * a number nobody meant.
 */
describe('the page turn', () => {
	for (const key of ['durationMs', 'grain', 'hardness'] as const)
		it(`ships a ${key} inside its own range`, () => {
			const range = PAGE_TURN_RANGES[key];
			expect(PAGE_TURN_DEFAULTS[key]).toBeGreaterThanOrEqual(range.min);
			expect(PAGE_TURN_DEFAULTS[key]).toBeLessThanOrEqual(range.max);
		});
});
