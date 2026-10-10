import { describe, expect, it } from 'vitest';
import { firstPlainLine, plainMarkdown } from './markdown-plain';

describe('plainMarkdown', () => {
	it('keeps the words and drops the marks', () => {
		expect(plainMarkdown('# Groceries\n- [ ] **milk** and _eggs_\n> `code` ~~gone~~')).toBe(
			'Groceries\nmilk and eggs\ncode gone'
		);
	});

	it('keeps a link’s text and a picture’s description', () => {
		expect(plainMarkdown('see [the plan](/tasks/calendar) ![a heron](/media/12)')).toBe(
			'see the plan a heron'
		);
	});

	it('leaves a word with underscores or a lone asterisk alone', () => {
		expect(plainMarkdown('snake_case_name costs 2 * 3')).toBe('snake_case_name costs 2 * 3');
	});

	it('flattens a table', () => {
		expect(plainMarkdown('| a | b |\n|---|---|\n| 1 | 2 |').replace(/\s+/g, ' ').trim()).toBe(
			'a b 1 2'
		);
	});
});

describe('firstPlainLine', () => {
	it('is the first line with words, as words', () => {
		expect(firstPlainLine('\n\n## **Dentist**\nbring the card')).toBe('Dentist');
		expect(firstPlainLine('  \n')).toBe('');
	});
});
