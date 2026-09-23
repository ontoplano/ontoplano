import { describe, expect, test } from 'vitest';
import {
	MAX_SUGGESTIONS,
	draftTags,
	endsTag,
	suggestTags,
	tagsFrom,
	tagsValue
} from '../src/lib/tag-typing';
import { parseTags } from '../src/lib/services/tags';

/**
 * Typing tags into a box.
 *
 * The chips are the tags and the input is the word being typed. They were one
 * string once, which is why the input never cleared and nothing was ever
 * suggested: clearing it would have deleted the chips, and the "word being
 * typed" was whatever trailed the last separator — nothing, right after a
 * space. These tests are the two halves kept apart.
 */
describe('the tags a value arrived with', () => {
	test('are what the server would have stored', () => {
		expect(tagsFrom('work, urgent house')).toEqual(parseTags('work, urgent house'));
		expect(tagsFrom('work, urgent house')).toEqual(['work', 'urgent', 'house']);
	});

	test('and nothing, for nothing', () => {
		expect(tagsFrom('')).toEqual([]);
		expect(tagsFrom('   ')).toEqual([]);
	});

	test('go back as the one string the server expects', () => {
		expect(tagsValue(['work', 'urgent'])).toBe('work, urgent');
		expect(tagsValue([])).toBe('');
		// And a round trip changes nothing.
		expect(tagsFrom(tagsValue(['work', 'urgent']))).toEqual(['work', 'urgent']);
	});
});

describe('the word being typed', () => {
	test('becomes a tag, in the shape the server uses', () => {
		expect(draftTags('Work')).toEqual(['work']);
		expect(draftTags('  urgent  ')).toEqual(['urgent']);
		// People type #work out of habit; the vocabulary has no hashes in it.
		expect(draftTags('#house')).toEqual(['house']);
	});

	test('is nothing when it is nothing', () => {
		expect(draftTags('')).toEqual([]);
		expect(draftTags('   ')).toEqual([]);
		expect(draftTags('#')).toEqual([]);
	});

	test('is several when several were pasted in at once', () => {
		// A draft is not always typed a letter at a time. Taking the first and
		// dropping the rest would lose them without saying so.
		expect(draftTags('work, urgent')).toEqual(['work', 'urgent']);
		expect(draftTags('#A1, Done')).toEqual(['a1', 'done']);
	});

	test('is not a second copy of one already on the box', () => {
		// Pressing space twice is not two tags.
		expect(draftTags('work', ['work'])).toEqual([]);
		expect(draftTags('WORK', ['work'])).toEqual([]);
		expect(draftTags('urgent', ['work'])).toEqual(['urgent']);
		// Nor twice within one paste.
		expect(draftTags('work work urgent')).toEqual(['work', 'urgent']);
	});

	test('is ended by a space, a comma, tab or enter', () => {
		expect(endsTag(' ')).toBe(true);
		expect(endsTag(',')).toBe(true);
		expect(endsTag('Tab')).toBe(true);
		expect(endsTag('Enter')).toBe(true);
		expect(endsTag('a')).toBe(false);
		expect(endsTag('Backspace')).toBe(false);
	});
});

describe('which known tags a draft could be', () => {
	const known = ['work', 'urgent', 'house', 'holiday', 'homework', 'gut'];

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

	test('the case somebody typed does not matter, nor a leading hash', () => {
		expect(suggestTags(known, 'URG')).toContain('urgent');
		expect(suggestTags(known, '#urg')).toContain('urgent');
		expect(suggestTags(known, 'wo', ['WORK'])).not.toContain('work');
	});

	test('an empty draft offers everything, capped', () => {
		expect(suggestTags(known, '').length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
	});
});
