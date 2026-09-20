import { describe, expect, test } from 'vitest';
import {
	MAX_SUGGESTIONS,
	splitTyping,
	suggestTags,
	withTag,
	withoutTag
} from '../src/lib/tag-typing';
import { parseTags } from '../src/lib/services/tags';

/**
 * Typing tags into a box.
 *
 * The rule that matters is that the box agrees with the server: `parseTags`
 * has always split on commas and spaces, so "work urgent" was two tags the
 * moment it was saved and the box was the only thing that did not know.
 */
describe('what is settled and what is still being typed', () => {
	test('a trailing space finishes the word', () => {
		expect(splitTyping('work ')).toEqual({ settled: ['work'], draft: '' });
		expect(splitTyping('work')).toEqual({ settled: [], draft: 'work' });
	});

	test('a comma finishes it too, and so does a comma and a space', () => {
		expect(splitTyping('work,')).toEqual({ settled: ['work'], draft: '' });
		expect(splitTyping('work, ')).toEqual({ settled: ['work'], draft: '' });
		expect(splitTyping('work, urg')).toEqual({ settled: ['work'], draft: 'urg' });
	});

	test('several settled words and one draft', () => {
		expect(splitTyping('work urgent ho')).toEqual({
			settled: ['work', 'urgent'],
			draft: 'ho'
		});
	});

	test('a leading hash is not part of the word', () => {
		// People type #work out of habit; the vocabulary has no hashes in it.
		expect(splitTyping('#wor')).toEqual({ settled: [], draft: 'wor' });
		expect(splitTyping('#work ')).toEqual({ settled: ['work'], draft: '' });
	});

	test('an empty box is empty, not a draft of nothing', () => {
		expect(splitTyping('')).toEqual({ settled: [], draft: '' });
	});

	test('and it agrees with the server about what the tags are', () => {
		const raw = 'work, urgent house';
		expect(splitTyping(`${raw} `).settled).toEqual(parseTags(raw));
	});
});

describe('which known tags a draft could be', () => {
	const known = ['work', 'urgent', 'house', 'holiday', 'homework', 'gut'];

	test('an empty draft offers everything, capped', () => {
		expect(suggestTags(known, '').length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
	});

	test('a prefix wins over a word that merely contains it', () => {
		const found = suggestTags(known, 'ho');
		expect(found[0]).toBe('house');
		expect(found).toContain('homework');
		expect(found).toContain('holiday');
	});

	test('a fuzzy run of letters still matches, and nonsense does not', () => {
		expect(suggestTags(known, 'hmwrk')).toContain('homework');
		expect(suggestTags(known, 'zzz')).toEqual([]);
	});

	test('one already on the box is not offered again', () => {
		expect(suggestTags(known, 'wo', ['work'])).not.toContain('work');
	});

	test('the case somebody typed does not matter', () => {
		expect(suggestTags(known, 'URG')).toContain('urgent');
		expect(suggestTags(known, 'wo', ['WORK'])).not.toContain('work');
	});
});

describe('choosing and dropping one', () => {
	test('choosing puts it on the end, ready for the next', () => {
		expect(withTag('work, urg', 'urgent')).toBe('work, urgent, ');
		expect(withTag('', 'work')).toBe('work, ');
	});

	test('choosing one that is already on changes nothing but the draft', () => {
		expect(withTag('work, wo', 'work')).toBe('work, ');
	});

	test('dropping takes it off and leaves the rest', () => {
		expect(withoutTag('work, urgent, ', 'urgent')).toBe('work, ');
		expect(withoutTag('work, ', 'work')).toBe('');
	});

	test('dropping is case-insensitive, like everything else here', () => {
		expect(withoutTag('work, urgent, ', 'URGENT')).toBe('work, ');
	});
});
