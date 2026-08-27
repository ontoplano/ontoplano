import { describe, expect, test } from 'vitest';
import { parseLine, parseLines } from './ingredient-lines';

describe('reading one line', () => {
	test('quantity, unit and name', () => {
		expect(parseLine('300 g rice')).toEqual({ quantity: 300, unit: 'g', name: 'rice', note: '' });
	});

	test('no quantity at all', () => {
		expect(parseLine('salt')).toEqual({ quantity: null, unit: '', name: 'salt', note: '' });
	});

	test('a quantity with no unit', () => {
		expect(parseLine('3 eggs')).toEqual({ quantity: 3, unit: '', name: 'eggs', note: '' });
	});

	test('what comes after a comma is how to prepare it', () => {
		expect(parseLine('2 onions, finely chopped')).toEqual({
			quantity: 2,
			unit: '',
			name: 'onions',
			note: 'finely chopped'
		});
	});

	test('fractions, written either way', () => {
		expect(parseLine('½ tsp salt')?.quantity).toBe(0.5);
		expect(parseLine('1/2 tsp salt')?.quantity).toBe(0.5);
		expect(parseLine('1 1/2 cups flour')?.quantity).toBe(1.5);
	});

	test('a decimal comma, because half the world writes one', () => {
		expect(parseLine('0,5 l milk')).toEqual({ quantity: 0.5, unit: 'l', name: 'milk', note: '' });
	});

	test('a word that is not a unit stays part of the name', () => {
		expect(parseLine('2 large potatoes')).toEqual({
			quantity: 2,
			unit: '',
			name: 'large potatoes',
			note: ''
		});
	});

	test('bullets, dashes, numbers and checkboxes are all just list markers', () => {
		for (const marker of ['- ', '* ', '• ', '1. ', '[ ] ', '[x] ']) {
			expect(parseLine(`${marker}400 g black beans`)?.name).toBe('black beans');
		}
	});

	test('a heading is not an ingredient', () => {
		expect(parseLine('For the sauce:')).toBeNull();
		expect(parseLine('Ingredients:')).toBeNull();
	});

	test('an empty line is nothing', () => {
		expect(parseLine('   ')).toBeNull();
		expect(parseLine('')).toBeNull();
	});

	test('a quantity with nothing after it is not an ingredient', () => {
		expect(parseLine('300 g')).toBeNull();
	});
});

describe('reading a pasted block', () => {
	test('the whole thing, headings and blanks dropped', () => {
		const parsed = parseLines(`Ingredients:

- 300 g rice
- 400 g black beans
- 3 cloves garlic, crushed

For the sauce:
2 tbsp olive oil`);

		expect(parsed.map((p) => p.name)).toEqual(['rice', 'black beans', 'garlic', 'olive oil']);
		expect(parsed[2]).toEqual({ quantity: 3, unit: 'cloves', name: 'garlic', note: 'crushed' });
	});

	test('nothing pasted is nothing parsed', () => {
		expect(parseLines('')).toEqual([]);
	});
});
