import { describe, expect, it } from 'vitest';

import { unsafePattern } from '../src/lib/services/regex-safety';

/**
 * The patterns on the left are ones somebody would really write for a bank
 * statement; the ones on the right are the shapes that hang a server.
 */
describe('patterns a rule may use', () => {
	const fine = [
		'mercado|hortifruti',
		'^UBER',
		'\\d{2}/\\d{2}',
		'padaria .*',
		'(cat|dog)+',
		'[a-z]+@[a-z]+\\.com',
		'ifood|rappi|zé delivery',
		'Dm \\*Company',
		'pix.*recebido$'
	];
	for (const pattern of fine)
		it(`takes ${pattern}`, () => expect(unsafePattern(pattern)).toBeNull());
});

describe('patterns that would never finish', () => {
	const refused = [
		'(a+)+$',
		'(a*)*b',
		'(x+x+)+y',
		'(a|ab)+',
		'(\\w+\\s?)*$',
		'(.*)*x',
		'([a-z]+)+!'
	];
	for (const pattern of refused)
		it(`refuses ${pattern}`, () => expect(unsafePattern(pattern)).toBeTruthy());

	it('refuses a backreference', () => expect(unsafePattern('(a)\\1')).toBeTruthy());
	it('refuses an enormous count', () => expect(unsafePattern('a{100000}')).toBeTruthy());
	it('names the shape rather than the rule', () =>
		expect(unsafePattern('(a+)+')).toMatch(/repetition inside a repetition/i));
});
