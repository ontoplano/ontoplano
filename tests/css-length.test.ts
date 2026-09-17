/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { cssLengthPx } from '../src/lib/css-length';

/**
 * A length written in a stylesheet, read back as a number of pixels.
 *
 * `getPropertyValue` hands back what was written, and `parseFloat('3.5rem')`
 * is 3.5 — three and a half pixels where fifty-six were meant. What that
 * looked like was the capture wheel sitting fifty pixels too low, drawn half
 * behind the navigation bar, with the bottom wedge the hardest to hit on the
 * screen it was designed for. Nothing failed; it just looked slightly wrong
 * for months.
 */
describe('a CSS length in pixels', () => {
	it('resolves rem against the root font size', () => {
		document.documentElement.style.fontSize = '16px';
		expect(cssLengthPx('3.5rem')).toBe(56);
		expect(cssLengthPx('1rem')).toBe(16);
	});

	it('follows a root that is not sixteen', () => {
		document.documentElement.style.fontSize = '20px';
		expect(cssLengthPx('3.5rem')).toBe(70);
		document.documentElement.style.fontSize = '16px';
	});

	it('takes pixels as pixels', () => {
		expect(cssLengthPx('56px')).toBe(56);
		expect(cssLengthPx(' 12px ')).toBe(12);
		// What an unresolved `env()` falls back to.
		expect(cssLengthPx('0px')).toBe(0);
	});

	it('is zero for anything that is not a length', () => {
		expect(cssLengthPx('')).toBe(0);
		expect(cssLengthPx('auto')).toBe(0);
		expect(cssLengthPx('var(--nope)')).toBe(0);
	});
});
