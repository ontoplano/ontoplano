import { describe, expect, test } from 'vitest';
import { checklistItems, isChecklist } from './checklist';

describe('deciding whether a note is a list', () => {
	test('ordinary writing is not', () => {
		expect(isChecklist('the wall is 2.4m and the door opens inward')).toBe(false);
	});

	test('a bare bracket in a sentence is a sentence', () => {
		expect(isChecklist('he said [ ] was the wrong size')).toBe(false);
	});

	test('one checkbox is enough', () => {
		expect(isChecklist('shopping\n\n- [ ] milk')).toBe(true);
	});

	test('a checkbox with nothing written on it is not a todo', () => {
		expect(isChecklist('- [ ]   ')).toBe(false);
	});
});

describe('what each checkbox takes with it', () => {
	test('the line is the title', () => {
		expect(checklistItems('- [ ] ring the plumber')).toEqual([
			{ title: 'ring the plumber', notes: '', done: false }
		]);
	});

	test('everything under it, until the next one, is its notes', () => {
		const note = [
			'- [ ] ring the plumber',
			'  the boiler makes a noise after 9pm',
			'  his number is on the fridge',
			'- [ ] book the MOT'
		].join('\n');
		expect(checklistItems(note)).toEqual([
			{
				title: 'ring the plumber',
				notes: 'the boiler makes a noise after 9pm\nhis number is on the fridge',
				done: false
			},
			{ title: 'book the MOT', notes: '', done: false }
		]);
	});

	test('a ticked box comes across ticked', () => {
		expect(checklistItems('- [x] book the MOT')[0].done).toBe(true);
		expect(checklistItems('- [X] book the MOT')[0].done).toBe(true);
	});

	test('anything written above the first box belongs to the note', () => {
		const note = 'bought the tickets already\n\n- [ ] pack';
		expect(checklistItems(note)).toEqual([{ title: 'pack', notes: '', done: false }]);
	});

	test('takes the bullet people actually typed', () => {
		expect(checklistItems('* [ ] milk\n+ [ ] bread\n- [] eggs').map((i) => i.title)).toEqual([
			'milk',
			'bread',
			'eggs'
		]);
	});

	/*
	 * Notes are indented to sit under their checkbox. Four spaces of it is a
	 * code block in markdown, so the shared indent comes off and only the
	 * shape inside survives.
	 */
	test('drops the indent they all share and keeps the shape inside', () => {
		const note = ['- [ ] pack', '    clothes:', '      - socks', '      - a coat'].join('\n');
		expect(checklistItems(note)[0].notes).toBe('clothes:\n  - socks\n  - a coat');
	});

	test('blank lines around the notes go, blank lines inside them stay', () => {
		const note = ['- [ ] pack', '', '  clothes', '', '  and a book', '', ''].join('\n');
		expect(checklistItems(note)[0].notes).toBe('clothes\n\nand a book');
	});

	test('strips markdown that would read as decoration in a title', () => {
		expect(checklistItems('- [ ] **ring the plumber**')[0].title).toBe('ring the plumber');
	});

	test('a recording or a picture under a box rides along in its notes', () => {
		const note = '- [ ] fix the header\n  ![shot](/media/12)';
		expect(checklistItems(note)[0].notes).toBe('![shot](/media/12)');
	});
});
