import { describe, expect, it } from 'vitest';
import { ratingAtPoint } from './rating-press';

describe('a press on the bars', () => {
	it('names the bar showing under it, left to right', () => {
		// The strip of ground and the first column are both urgency's.
		expect(ratingAtPoint(0.1, 0.5).rating).toBe('urgency');
		expect(ratingAtPoint(0.4, 0.5).rating).toBe('urgency');
		expect(ratingAtPoint(0.6, 0.5).rating).toBe('ease');
		expect(ratingAtPoint(0.9, 0.5).rating).toBe('interest');
	});

	it('reads the height as the value, a fifth at a time', () => {
		expect(ratingAtPoint(0.9, 0.99).value).toBe(1);
		expect(ratingAtPoint(0.9, 0.5).value).toBe(3);
		expect(ratingAtPoint(0.9, 0.01).value).toBe(5);
	});

	it('stays on the scale at the very edges', () => {
		expect(ratingAtPoint(1, 0)).toEqual({ rating: 'interest', value: 5 });
		expect(ratingAtPoint(0, 1)).toEqual({ rating: 'urgency', value: 1 });
	});
});
