import { describe, expect, it, vi } from 'vitest';

import { PAGE_TURN_DEFAULTS, PAGE_TURN_RANGES } from '../src/lib/page-turn';

/**
 * The dissolve's numbers are decided by watching it on a real phone, so they
 * are turned at /dev/page-turn and kept in that browser. What is worth
 * checking without a browser is that the defaults are inside the ranges the
 * sliders offer — a default outside its own slider is a workbench that cannot
 * show you what the app actually does.
 */
describe('the page turn', () => {
	for (const key of ['durationMs', 'grain', 'hardness'] as const)
		it(`ships a ${key} its slider can reach`, () => {
			const range = PAGE_TURN_RANGES[key];
			expect(PAGE_TURN_DEFAULTS[key]).toBeGreaterThanOrEqual(range.min);
			expect(PAGE_TURN_DEFAULTS[key]).toBeLessThanOrEqual(range.max);
		});

	it('keeps what was turned, and forgets it on demand', async () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k)
		});

		const live = await import('../src/lib/page-turn.svelte');
		live.PAGE_TURN.durationMs = 420;
		live.keepPageTurn();
		expect(JSON.parse(store.get('ontoplano:page-turn')!)).toMatchObject({ durationMs: 420 });

		live.resetPageTurn();
		expect(live.PAGE_TURN.durationMs).toBe(PAGE_TURN_DEFAULTS.durationMs);
		expect(store.has('ontoplano:page-turn')).toBe(false);
	});
});
