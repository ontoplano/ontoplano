import { describe, expect, test } from 'vitest';
import { str } from '../src/lib/services/validate';

describe('a string over its limit', () => {
	test('says how long it is and how much to cut', () => {
		expect(() => str('x'.repeat(5873), 'content', { max: 4000 })).toThrow(
			'Content is 5873/4000 characters, 1873 over the limit'
		);
	});

	test('at the limit is accepted', () => {
		expect(str('x'.repeat(4000), 'content', { max: 4000 })).toHaveLength(4000);
	});
});
