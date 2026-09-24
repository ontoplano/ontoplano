import { describe, expect, test } from 'vitest';
import {
	UNTAGGED,
	isTagFiltering,
	passesTagFilter,
	tagFilterFromQuery,
	writeTagFilter,
	type TagFilter
} from './tag-filter';

const f = (over: Partial<TagFilter>): TagFilter => ({
	include: [],
	exclude: [],
	mode: 'any',
	...over
});

describe('passesTagFilter', () => {
	test('no filter lets everything through', () => {
		expect(passesTagFilter([], f({}))).toBe(true);
		expect(passesTagFilter(['a'], f({}))).toBe(true);
	});

	test('any: one of the included labels is enough', () => {
		const filter = f({ include: ['a', 'b'] });
		expect(passesTagFilter(['a'], filter)).toBe(true);
		expect(passesTagFilter(['b', 'c'], filter)).toBe(true);
		expect(passesTagFilter(['c'], filter)).toBe(false);
		expect(passesTagFilter([], filter)).toBe(false);
	});

	test('all: every included label must be there', () => {
		const filter = f({ include: ['a', 'b'], mode: 'all' });
		expect(passesTagFilter(['a', 'b', 'c'], filter)).toBe(true);
		expect(passesTagFilter(['a'], filter)).toBe(false);
	});

	test('exclude drops anything carrying any of them, in either mode', () => {
		expect(passesTagFilter(['a', 'x'], f({ include: ['a'], exclude: ['x', 'y'] }))).toBe(false);
		expect(
			passesTagFilter(['a', 'b', 'y'], f({ include: ['a', 'b'], exclude: ['y'], mode: 'all' }))
		).toBe(false);
		expect(passesTagFilter(['c'], f({ exclude: ['x'] }))).toBe(true);
		expect(passesTagFilter([], f({ exclude: ['x'] }))).toBe(true);
	});

	test('untagged kept is "carries none"; untagged dropped is "carries some"', () => {
		expect(passesTagFilter([], f({ include: [UNTAGGED] }))).toBe(true);
		expect(passesTagFilter(['a'], f({ include: [UNTAGGED] }))).toBe(false);
		expect(passesTagFilter(['a'], f({ include: [UNTAGGED, 'a'] }))).toBe(true);
		expect(passesTagFilter([], f({ exclude: [UNTAGGED] }))).toBe(false);
		expect(passesTagFilter(['a'], f({ exclude: [UNTAGGED] }))).toBe(true);
	});
});

describe('the URL', () => {
	test('round-trips, leaving other parameters alone', () => {
		const filter = f({ include: ['a', UNTAGGED], exclude: ['x'], mode: 'all' });
		const written = writeTagFilter(new URLSearchParams('q=1&tag=old'), filter);
		expect(written.get('q')).toBe('1');
		expect(tagFilterFromQuery(written)).toEqual(filter);
	});

	test('any is the default and is not written', () => {
		expect(writeTagFilter(new URLSearchParams(), f({ include: ['a'] })).toString()).toBe('tag=a');
		expect(tagFilterFromQuery(new URLSearchParams('tag=a&tagmode=nonsense')).mode).toBe('any');
	});

	test('a name asked for and against is only dropped', () => {
		expect(tagFilterFromQuery(new URLSearchParams('tag=a&nottag=a&tag=%23B'))).toEqual(
			f({ include: ['b'], exclude: ['a'] })
		);
	});

	test('whether anything is narrowed', () => {
		expect(isTagFiltering(f({ mode: 'all' }))).toBe(false);
		expect(isTagFiltering(f({ exclude: [UNTAGGED] }))).toBe(true);
	});
});
