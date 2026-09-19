import { describe, expect, it } from 'vitest';
import {
	defaultDirectionFor,
	isNoteDirection,
	isNoteOrder,
	orderNotes,
	sortTitle,
	type Sortable
} from './note-order';

const note = (over: Partial<Sortable> & { id: number }): Sortable => ({
	title: '',
	content: '',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	pinnedAt: null,
	...over
});

const ids = (rows: Sortable[]) => rows.map((r) => r.id);

describe('the order a notebook is read in', () => {
	const notes = [
		note({
			id: 1,
			title: 'Beta',
			createdAt: '2026-03-01T00:00:00.000Z',
			updatedAt: '2026-03-09T00:00:00.000Z'
		}),
		note({
			id: 2,
			title: 'alpha',
			createdAt: '2026-03-02T00:00:00.000Z',
			updatedAt: '2026-03-03T00:00:00.000Z'
		}),
		note({
			id: 3,
			title: 'Gamma',
			createdAt: '2026-03-03T00:00:00.000Z',
			updatedAt: '2026-03-04T00:00:00.000Z'
		})
	];

	it('reads oldest first by default, the way the pages of one go', () => {
		expect(ids(orderNotes(notes, 'written', 'asc'))).toEqual([1, 2, 3]);
	});

	it('turns round', () => {
		expect(ids(orderNotes(notes, 'written', 'desc'))).toEqual([3, 2, 1]);
	});

	it('sorts titles the way a person reads them, not by capital letters', () => {
		// 'alpha' before 'Beta': a code-point sort puts every capital first and
		// makes the list look unsorted.
		expect(ids(orderNotes(notes, 'title', 'asc'))).toEqual([2, 1, 3]);
		expect(ids(orderNotes(notes, 'title', 'desc'))).toEqual([3, 1, 2]);
	});

	it('orders by when it was last edited, which is not when it was written', () => {
		expect(ids(orderNotes(notes, 'edited', 'desc'))).toEqual([1, 3, 2]);
	});

	it('leaves what it was given alone', () => {
		const before = ids(notes);
		orderNotes(notes, 'title', 'desc');
		expect(ids(notes)).toEqual(before);
	});
});

describe('a pin outranks the order', () => {
	const notes = [
		note({ id: 1, title: 'Aaa' }),
		note({ id: 2, title: 'Zzz', pinnedAt: '2026-03-01T00:00:00.000Z' }),
		note({ id: 3, title: 'Mmm', pinnedAt: '2026-03-05T00:00:00.000Z' })
	];

	it('keeps the pinned ones on top in every order and both directions', () => {
		for (const order of ['written', 'title', 'edited'] as const)
			for (const direction of ['asc', 'desc'] as const) {
				const rows = orderNotes(notes, order, direction);
				expect(ids(rows).slice(0, 2).sort()).toEqual([2, 3]);
			}
	});

	it('leads with the one pinned most recently', () => {
		expect(ids(orderNotes(notes, 'title', 'asc'))).toEqual([3, 2, 1]);
	});
});

describe('a note with no name', () => {
	it('is sorted by the line the card shows instead', () => {
		expect(sortTitle(note({ id: 1, content: '  the meter reading\nand more' }))).toBe(
			'the meter reading'
		);
	});

	it('does not collapse every untitled note into one block', () => {
		const rows = [
			note({ id: 1, content: 'zebra' }),
			note({ id: 2, content: 'apple' }),
			note({ id: 3, title: 'Mango' })
		];
		expect(ids(orderNotes(rows, 'title', 'asc'))).toEqual([2, 3, 1]);
	});
});

describe('the stored choice', () => {
	it('refuses anything it did not write', () => {
		expect(isNoteOrder('title')).toBe(true);
		expect(isNoteOrder('whatever')).toBe(false);
		expect(isNoteDirection('desc')).toBe(true);
		expect(isNoteDirection('sideways')).toBe(false);
	});

	it('opens "edited" at the most recent, which is the question being asked', () => {
		expect(defaultDirectionFor('edited')).toBe('desc');
		expect(defaultDirectionFor('written')).toBe('asc');
		expect(defaultDirectionFor('title')).toBe('asc');
	});
});
