import { describe, expect, test } from 'vitest';
import { compareItems, itemDirectionFor } from '../src/lib/item-order';

const item = (
	id: number,
	name: string,
	qty: number,
	priceCents: number | null,
	createdAt: string
) => ({
	id,
	name,
	qty,
	priceCents,
	createdAt
});

const rows = [
	item(1, 'rice', 2, 320, '2026-09-01T10:00:00Z'),
	item(2, 'beans', 0, null, '2026-09-03T10:00:00Z'),
	item(3, 'milk', 5, 180, '2026-09-02T10:00:00Z')
];

const names = (order: Parameters<typeof compareItems>[2], direction: 'asc' | 'desc') =>
	[...rows].sort((a, b) => compareItems(a, b, order, direction)).map((one) => one.name);

describe('the order inside an inventory card', () => {
	test('names read A to Z by default, and flip', () => {
		expect(itemDirectionFor('name')).toBe('asc');
		expect(names('name', 'asc')).toEqual(['beans', 'milk', 'rice']);
		expect(names('name', 'desc')).toEqual(['rice', 'milk', 'beans']);
	});

	test('the newest is first by default', () => {
		expect(itemDirectionFor('added')).toBe('desc');
		expect(names('added', 'desc')).toEqual(['beans', 'milk', 'rice']);
	});

	test('counts sort by how many there are', () => {
		expect(names('count', 'desc')).toEqual(['milk', 'rice', 'beans']);
	});

	test('a thing with no price is last whichever way round', () => {
		expect(names('price', 'desc')).toEqual(['rice', 'milk', 'beans']);
		expect(names('price', 'asc')).toEqual(['milk', 'rice', 'beans']);
	});
});
