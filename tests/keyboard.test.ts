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
import { KEYBOARD_THRESHOLD, openedHeight, panelHeight, panelTop } from '../src/lib/keyboard';

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

	test('and the sheet starts where the visible part starts', () => {
		// The Android app pans rather than resizes: pinned at the layout's top,
		// the sheet ended 200px above the keyboard with the page showing below.
		expect(panelTop({ innerHeight: 844, viewportHeight: 500, offsetTop: 200 })).toBe(200);
		expect(panelTop({ innerHeight: 844, viewportHeight: 524, offsetTop: 0 })).toBe(0);
	});

	test('no keyboard, no offset', () => {
		// A collapsing URL bar moves the viewport too; that is not a keyboard.
		expect(panelTop({ innerHeight: 844, viewportHeight: 800, offsetTop: 44 })).toBe(0);
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

describe('a keyboard that resizes the page instead of covering it', () => {
	test('is still a keyboard', () => {
		// Chrome with `interactive-widget=resizes-content`, and the Android app,
		// which shrinks its web view: both heights fall together.
		const resized = { innerHeight: 524, viewportHeight: 524, offsetTop: 0 };
		expect(panelHeight(resized)).toBe(null);
		expect(panelHeight({ ...resized, openedHeight: 844 })).toBe(524);
		expect(panelTop({ ...resized, openedHeight: 844 })).toBe(0);
	});

	test('the height before it is the tallest seen at this width', () => {
		let before = openedHeight(null, { width: 390, height: 844 });
		before = openedHeight(before, { width: 390, height: 524 });
		expect(before.height).toBe(844);
		before = openedHeight(before, { width: 390, height: 844 });
		expect(before.height).toBe(844);
	});

	test('a rotation starts the measure again', () => {
		const before = openedHeight({ width: 390, height: 844 }, { width: 844, height: 390 });
		expect(before).toEqual({ width: 844, height: 390 });
		expect(
			panelHeight({
				innerHeight: 390,
				viewportHeight: 390,
				offsetTop: 0,
				openedHeight: before.height
			})
		).toBe(null);
	});
});
