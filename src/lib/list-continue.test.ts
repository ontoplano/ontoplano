import { describe, expect, test } from 'vitest';
import { continueList } from './list-continue';

/** The text and caret after Enter at `start`, or null. */
function enter(value: string, start: number, end = start) {
	const edit = continueList(value, start, end);
	if (!edit) return null;
	return {
		value: value.slice(0, edit.from) + edit.text + value.slice(edit.to),
		caret: edit.from + edit.text.length
	};
}
const at = (value: string) => enter(value, value.length);

describe('Enter on a line of a list', () => {
	test('a tick box starts the next line with an empty one', () => {
		expect(at('- [ ] milk')).toEqual({ value: '- [ ] milk\n- [ ] ', caret: 17 });
	});

	test('even after a ticked one', () => {
		expect(at('- [x] eggs')?.value).toBe('- [x] eggs\n- [ ] ');
	});

	test('a bullet carries its bullet and its indent', () => {
		expect(at('  * bread')?.value).toBe('  * bread\n  * ');
	});

	test('a number carries the next number', () => {
		expect(at('3. third')?.value).toBe('3. third\n4. ');
	});

	test('a line that is only the marker ends the list', () => {
		expect(at('- [ ] milk\n- [ ] ')).toEqual({ value: '- [ ] milk\n', caret: 11 });
	});

	test('in the middle of a line, the rest moves down after the marker', () => {
		const value = '- [ ] milk and eggs';
		expect(enter(value, 10)?.value).toBe('- [ ] milk\n- [ ]  and eggs');
	});

	test('anything else is the browser’s own Enter', () => {
		expect(at('just words')).toBeNull();
		expect(at('')).toBeNull();
		expect(continueList('- [ ] milk', 0, 4)).toBeNull();
	});
});
