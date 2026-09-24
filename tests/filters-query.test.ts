/**
 * A list's narrowing, as the address spells it.
 *
 * Absent means the default, which is what keeps an unfiltered list's address
 * clean — and what makes a saved filter a short string rather than a wall of
 * `=false`. Everything outside the list's own parameters is left alone,
 * because the tag filter writes into the same address.
 */
import { expect, test } from 'vitest';
import { isNarrowed, readFilters, writeFilters } from '../src/lib/filters-query';

const DEFAULTS = { done: '', away: '', notebook: '' };

test('what is not in the address is the default', () => {
	expect(readFilters(new URLSearchParams(''), DEFAULTS)).toEqual(DEFAULTS);
	expect(readFilters(new URLSearchParams('done=show'), DEFAULTS)).toEqual({
		...DEFAULTS,
		done: 'show'
	});
});

test('a value that is the default is not written', () => {
	const out = writeFilters(new URLSearchParams('done=show'), DEFAULTS, DEFAULTS);
	expect(out.toString()).toBe('');
});

test('somebody else’s parameters are left where they are', () => {
	// The tag filter writes `tag` and `nottag` into this same address.
	const out = writeFilters(new URLSearchParams('tag=home&nottag=done'), DEFAULTS, {
		...DEFAULTS,
		done: 'show'
	});

	expect(out.get('tag')).toBe('home');
	expect(out.get('nottag')).toBe('done');
	expect(out.get('done')).toBe('show');
});

test('narrowed means something is saying other than the default', () => {
	expect(isNarrowed(DEFAULTS, DEFAULTS)).toBe(false);
	expect(isNarrowed({ ...DEFAULTS, notebook: '3' }, DEFAULTS)).toBe(true);
});
