import { describe, expect, test } from 'vitest';
import { parseQuery } from './search';

describe('narrowing a search before it runs', () => {
	test('a bare query narrows nothing', () => {
		expect(parseQuery('kitchen tiles')).toEqual({
			kinds: null,
			notebook: null,
			text: 'kitchen tiles'
		});
	});

	test('a kind prefix keeps the rest as the query', () => {
		expect(parseQuery('todo:shoes')).toEqual({ kinds: ['todo'], notebook: null, text: 'shoes' });
	});

	test('the plural people type by reflex works too', () => {
		expect(parseQuery('goals: run').kinds).toEqual(['goal']);
		expect(parseQuery('todos:x').kinds).toEqual(['todo']);
	});

	test('one prefix can name two kinds', () => {
		expect(parseQuery('diary:holiday').kinds).toEqual(['entry', 'note']);
	});

	test('two prefixes add up rather than fight', () => {
		expect(parseQuery('todo: goal: run').kinds).toEqual(['todo', 'goal']);
	});

	test('in: names a notebook and leaves the rest', () => {
		expect(parseQuery('in:kitchen tiles')).toEqual({
			kinds: null,
			notebook: 'kitchen',
			text: 'tiles'
		});
	});

	test('both at once', () => {
		expect(parseQuery('note: in:kitchen tiles')).toEqual({
			kinds: ['note'],
			notebook: 'kitchen',
			text: 'tiles'
		});
	});

	test('a word that is not a prefix stays part of the query', () => {
		expect(parseQuery('http://example.com')).toEqual({
			kinds: null,
			notebook: null,
			text: 'http://example.com'
		});
		expect(parseQuery('nonsense:thing').text).toBe('nonsense:thing');
	});

	test('a colon at either end is punctuation', () => {
		expect(parseQuery('why: because').text).toBe('why: because');
		expect(parseQuery(':shrug:').text).toBe(':shrug:');
	});

	test('nothing at all is nothing at all', () => {
		expect(parseQuery('')).toEqual({ kinds: null, notebook: null, text: '' });
	});
});
