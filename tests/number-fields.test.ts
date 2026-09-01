/**
 * @vitest-environment happy-dom
 *
 * Number boxes that expect to be typed into.
 *
 * The complaint was exact: a field showing `0`, clicked, puts the caret after
 * the zero, so typing 2 gives 02. A browser does that because in a text field
 * the existing value is usually something you are editing. In a small numeric
 * box it is a default nobody wants.
 *
 * Wired once for the document rather than per field, so a number input added
 * later behaves without anybody remembering this exists — which is why the
 * test adds one after the fact.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { smartNumberFields, withoutLeadingZeros } from '../src/lib/number-fields';

let stop: (() => void) | null = null;

afterEach(() => {
	stop?.();
	stop = null;
	document.body.innerHTML = '';
});

function field(value = '0'): HTMLInputElement {
	document.body.innerHTML = `<input type="number" value="${value}" /><input type="text" value="0" />`;
	return document.body.querySelector('input[type=number]')!;
}

describe('a number field', () => {
	test('selects what is there when it is focused, so the first key replaces it', () => {
		const input = field('0');
		const text = document.body.querySelector<HTMLInputElement>('input[type=text]')!;
		// `selectionStart` is null on a number input by the spec, so the call is
		// what is observed rather than the range it produces. Browsers do honour
		// select() here; e2e/reminders.e2e.ts types into a real one.
		const selected = vi.spyOn(input, 'select');
		const notSelected = vi.spyOn(text, 'select');
		stop = smartNumberFields(document);

		input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		text.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		expect(selected).toHaveBeenCalled();
		expect(notSelected).not.toHaveBeenCalled();
	});

	test('drops a leading zero that got typed anyway', () => {
		const input = field('0');
		stop = smartNumberFields(document);

		input.value = '02';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		expect(input.value).toBe('2');
	});

	test('reaches a field that did not exist when it was wired', () => {
		field('0');
		stop = smartNumberFields(document);

		const later = document.createElement('input');
		later.type = 'number';
		later.value = '0';
		document.body.append(later);

		later.value = '045';
		later.dispatchEvent(new Event('input', { bubbles: true }));

		expect(later.value).toBe('45');
	});

	test('leaves text fields alone', () => {
		field();
		stop = smartNumberFields(document);
		const text = document.body.querySelector<HTMLInputElement>('input[type=text]')!;

		text.value = '007';
		text.dispatchEvent(new Event('input', { bubbles: true }));

		expect(text.value).toBe('007');
	});
});

describe('the leading zeros themselves', () => {
	test('go, when they are in front of a digit', () => {
		expect(withoutLeadingZeros('02')).toBe('2');
		expect(withoutLeadingZeros('007')).toBe('7');
		expect(withoutLeadingZeros('-05')).toBe('-5');
	});

	test('stay, when they are the number or the whole part of one', () => {
		expect(withoutLeadingZeros('0')).toBe('0');
		expect(withoutLeadingZeros('0.5')).toBe('0.5');
		expect(withoutLeadingZeros('')).toBe('');
		expect(withoutLeadingZeros('10')).toBe('10');
	});
});
