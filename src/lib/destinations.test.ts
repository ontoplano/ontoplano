import { describe, expect, test } from 'vitest';
import { DESTINATIONS, findDestinations, matchScore } from './destinations';

describe('matching what somebody types', () => {
	test('a prefix beats a match in the middle', () => {
		expect(matchScore('Board', 'bo')!).toBeGreaterThan(matchScore('Notebooks', 'bo')!);
	});

	test('scattered letters still match', () => {
		expect(matchScore('Planner To-do', 'pltd')).not.toBeNull();
	});

	test('letters in the wrong order do not', () => {
		expect(matchScore('Board', 'drab')).toBeNull();
	});

	test('an empty query keeps everything', () => {
		expect(findDestinations('')).toHaveLength(DESTINATIONS.length);
	});
});

describe('the list itself', () => {
	test('every destination has a label and a path', () => {
		for (const d of DESTINATIONS) {
			expect(d.label.length).toBeGreaterThan(0);
			expect(d.href.startsWith('/')).toBe(true);
		}
	});

	test('no two destinations share a path', () => {
		const paths = DESTINATIONS.map((d) => d.href);
		expect(new Set(paths).size).toBe(paths.length);
	});
});
