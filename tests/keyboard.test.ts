/**
 * The software keyboard, and the Save button it used to hide.
 *
 * A sheet is `height: 100dvh`, and `dvh` is the layout viewport — which the
 * keyboard covers rather than shrinks. So the footer of a full-height form
 * ended up underneath the keyboard, and confirming what you had just typed
 * meant dismissing the keyboard first.
 *
 * The arithmetic is here rather than in the component because it has to be
 * wrong in neither direction: too eager and the sheet jumps every time the URL
 * bar collapses, too shy and the button stays hidden.
 */
import { describe, expect, test } from 'vitest';
import { KEYBOARD_THRESHOLD, panelHeight } from '../src/lib/keyboard';

/** A phone with nothing covering the screen. */
const idle = { innerHeight: 844, viewportHeight: 844, offsetTop: 0 };

describe('when nothing should change', () => {
	test('an untouched screen leaves the sheet alone', () => {
		expect(panelHeight(idle)).toBe(null);
	});

	test('and so does the URL bar collapsing', () => {
		// 50-90px on most phones, and it happens on every scroll. Reacting to it
		// would resize the sheet under somebody's thumb while they read.
		expect(panelHeight({ ...idle, viewportHeight: 844 - 88 })).toBe(null);
	});

	test('and a reading just short of the threshold', () => {
		expect(panelHeight({ ...idle, viewportHeight: 844 - (KEYBOARD_THRESHOLD - 1) })).toBe(null);
	});
});

describe('when the keyboard is up', () => {
	test('the sheet becomes the part that is actually visible', () => {
		// A typical Android keyboard is around 300px.
		expect(panelHeight({ innerHeight: 844, viewportHeight: 524, offsetTop: 0 })).toBe(524);
	});

	test('and an offset viewport counts as covered too', () => {
		// iOS pushes the visible area down rather than only shrinking it.
		expect(panelHeight({ innerHeight: 844, viewportHeight: 500, offsetTop: 200 })).toBe(500);
	});
});

describe('a reading that cannot be trusted', () => {
	test('an absurdly short viewport is ignored rather than obeyed', () => {
		// Some browsers report a few pixels mid-animation. Obeying it collapses
		// the sheet to nothing in front of the person using it.
		expect(panelHeight({ innerHeight: 844, viewportHeight: 40, offsetTop: 0 })).toBe(null);
	});

	test('and so is a nonsensical one', () => {
		expect(panelHeight({ innerHeight: NaN, viewportHeight: 500, offsetTop: 0 })).toBe(null);
		// A visible area larger than the layout viewport is not a keyboard.
		expect(panelHeight({ innerHeight: 500, viewportHeight: 844, offsetTop: 0 })).toBe(null);
	});
});
