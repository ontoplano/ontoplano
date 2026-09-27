import { describe, expect, it } from 'vitest';
import { orderDiary } from './diary-order';

const entries = [
	{ id: 1, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-05T10:00:00Z', forDate: null },
	{
		id: 2,
		createdAt: '2026-09-03T10:00:00Z',
		updatedAt: '2026-09-03T10:00:00Z',
		forDate: '2026-08-20'
	},
	{ id: 3, createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z', forDate: null }
];
const ids = (list: { id: number }[]) => list.map((one) => one.id);

describe('orderDiary', () => {
	it('reads newest written first, the id breaking a tie', () => {
		expect(ids(orderDiary(entries, 'written', 'desc'))).toEqual([3, 2, 1]);
		expect(ids(orderDiary(entries, 'written', 'asc'))).toEqual([1, 2, 3]);
	});

	it('files an entry under the day it is for', () => {
		expect(ids(orderDiary(entries, 'day', 'desc'))).toEqual([3, 1, 2]);
	});

	it('puts the last touched first', () => {
		expect(ids(orderDiary(entries, 'edited', 'desc'))).toEqual([1, 3, 2]);
	});
});
