import { describe, expect, it } from 'vitest';
import { vocabularyFor } from './tag-vocabulary';

const data = {
	tagVocabulary: ['work', 'home', 'infra'],
	tagVocabularyByNotebook: { 12: ['infra'] }
};

describe('vocabularyFor', () => {
	it('offers only the notebook’s words for something filed under one', () => {
		expect(vocabularyFor(data, 12)).toEqual(['infra']);
	});

	it('offers nothing for a notebook that has no words yet', () => {
		expect(vocabularyFor(data, 99)).toEqual([]);
	});

	it('offers the whole vocabulary for something filed under nothing', () => {
		expect(vocabularyFor(data, null)).toEqual(['work', 'home', 'infra']);
	});
});
