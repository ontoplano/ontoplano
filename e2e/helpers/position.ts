import { expect } from '@playwright/test';

/**
 * How far a thing may land from where it was and still be "where it was".
 *
 * Layout is measured in fractions of a pixel, and the same box can come back
 * 0.4px off after an unrelated reflow — a font settling, a scrollbar
 * appearing. Rounding both sides does not help: 296.4 and 296.6 round apart.
 * A person sees nothing under a pixel; a jump worth catching is far larger.
 */
export const SUBPIXEL = 1;

/** That a measured edge has not moved, to within what anybody could see. */
export function expectStill(after: number, before: number, what = 'it moved') {
	expect(Math.abs(after - before), what).toBeLessThanOrEqual(SUBPIXEL);
}
