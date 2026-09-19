import { describe, expect, it } from 'vitest';
import { fuzzyMatch, fuzzyRank, markHits } from './fuzzy';

const names = ['learn russian', 'gym', 'morning gym', 'reading', 'deep work', 'lunch'];
const ranked = (query: string) => fuzzyRank(names, query, (n) => n).map((r) => r.item);

describe('finding a thing by typing at it', () => {
	it('matches letters in order without needing them adjacent', () => {
		expect(fuzzyMatch('learn russian', 'lr')).not.toBeNull();
		expect(fuzzyMatch('learn russian', 'russ')).not.toBeNull();
		expect(fuzzyMatch('learn russian', 'learn ru')).not.toBeNull();
	});

	it('refuses letters that are not there, or are in the wrong order', () => {
		expect(fuzzyMatch('learn russian', 'lz')).toBeNull();
		expect(fuzzyMatch('learn russian', 'rl')).toBeNull();
	});

	it('ignores case and the spaces in the query', () => {
		expect(fuzzyMatch('Learn Russian', 'LEARN RU')).not.toBeNull();
		expect(fuzzyMatch('learn russian', '  l r  ')).not.toBeNull();
	});

	it('says where every letter landed', () => {
		expect(fuzzyMatch('gym', 'gm')?.hits).toEqual([0, 2]);
	});
});

describe('the order the matches come back in', () => {
	it('puts the thing that starts with what you typed first', () => {
		expect(ranked('gym')[0]).toBe('gym');
	});

	it('prefers letters that sit close together', () => {
		// "lunch" holds l…u…n contiguously; "learn russian" spreads them out.
		expect(ranked('lun')[0]).toBe('lunch');
	});

	it('shows everything, in the order given, before anybody types', () => {
		expect(ranked('')).toEqual(names);
		expect(ranked('   ')).toEqual(names);
	});

	it('leaves out what cannot match at all', () => {
		expect(ranked('zzz')).toEqual([]);
	});
});

describe('showing why a row matched', () => {
	it('splits the label into the letters that hit and the ones that did not', () => {
		expect(markHits('gym', [0, 2])).toEqual([
			{ text: 'g', hit: true },
			{ text: 'y', hit: false },
			{ text: 'm', hit: true }
		]);
	});

	it('runs neighbours together rather than emitting a span per letter', () => {
		expect(markHits('reading', [0, 1, 2])).toEqual([
			{ text: 'rea', hit: true },
			{ text: 'ding', hit: false }
		]);
	});

	it('leaves an unsearched label whole', () => {
		expect(markHits('reading', [])).toEqual([{ text: 'reading', hit: false }]);
		expect(markHits('', [])).toEqual([]);
	});
});
