/**
 * @vitest-environment happy-dom
 *
 * A tap on a time or a date field opens its picker.
 *
 * On a phone, Chrome's time field is segments, and a tap selected the hour and
 * did nothing else: the clock opened only from the icon at the field's end.
 * Wired once for the document, so the test adds its fields after the fact.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { tapOpensPicker } from '../src/lib/picker-fields';

let stop: (() => void) | null = null;

afterEach(() => {
	stop?.();
	stop = null;
	document.body.innerHTML = '';
});

function field(attrs: string): HTMLInputElement {
	document.body.innerHTML = `<input ${attrs} />`;
	const input = document.body.querySelector('input')!;
	// happy-dom has no picker to open; the call is what is observed.
	input.showPicker = () => {};
	return input;
}

function press(target: Element, pointerType: string) {
	const event = new MouseEvent('click', { bubbles: true });
	Object.defineProperty(event, 'pointerType', { value: pointerType });
	target.dispatchEvent(event);
}

describe('a tap on a picker field', () => {
	test.each(['time', 'date', 'datetime-local'])('opens the picker of a %s field', (type) => {
		stop = tapOpensPicker(document);
		const input = field(`type="${type}"`);
		const opened = vi.spyOn(input, 'showPicker');
		press(input, 'touch');
		expect(opened).toHaveBeenCalledOnce();
	});

	test('leaves a mouse click to the segments', () => {
		stop = tapOpensPicker(document);
		const input = field('type="time"');
		const opened = vi.spyOn(input, 'showPicker');
		press(input, 'mouse');
		expect(opened).not.toHaveBeenCalled();
	});

	test('leaves a text field, a disabled field and a read-only one alone', () => {
		stop = tapOpensPicker(document);
		for (const attrs of ['type="text"', 'type="time" disabled', 'type="time" readonly']) {
			const input = field(attrs);
			const opened = vi.spyOn(input, 'showPicker');
			press(input, 'touch');
			expect(opened, attrs).not.toHaveBeenCalled();
		}
	});

	test('survives a browser that refuses to open it', () => {
		stop = tapOpensPicker(document);
		const input = field('type="time"');
		input.showPicker = () => {
			throw new DOMException('not allowed', 'NotAllowedError');
		};
		expect(() => press(input, 'touch')).not.toThrow();
	});
});
