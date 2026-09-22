/**
 * The words on a coloured pill are readable on every colour there is.
 *
 * This is the test that would have caught the thing somebody reported as
 * "unreadable shit". The stylesheet picked the ink by lightness — near-white
 * below a threshold, near-black above it — which is a good rule and a
 * measurably insufficient one: lightness is not luminance, and a vivid cyan
 * reads middling by the first and bright by the second, so it was handed white
 * ink on a bright field.
 *
 * The numbers below are the whole argument, so they are asserted rather than
 * written down: over a sweep of the colour space the old rule bottoms out
 * around 2.4:1, the best a lightness step can do is about 3.4:1, and choosing
 * between black and white by which actually contrasts more never goes under
 * the 4.5:1 that small text asks for.
 */
import { describe, expect, test } from 'vitest';

import {
	contrastRatio,
	pillInk,
	pillStyle,
	PILL_INK_DARK,
	PILL_INK_LIGHT,
	PILL_INK_SOFT
} from '../src/lib/pill-ink';

/** A sweep of sRGB, coarse enough to be quick and fine enough to catch a hole. */
function everyColour(): string[] {
	const out: string[] = [];
	for (let r = 0; r <= 255; r += 15)
		for (let g = 0; g <= 255; g += 15)
			for (let b = 0; b <= 255; b += 15)
				out.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
	return out;
}

describe('the ink on a pill', () => {
	test('never falls under what small text needs, on any colour', () => {
		let worst = Infinity;
		let worstAt = '';
		for (const fill of everyColour()) {
			const ink = pillInk(fill);
			expect(ink, fill).not.toBeNull();
			const ratio = contrastRatio(fill, ink!);
			if (ratio < worst) {
				worst = ratio;
				worstAt = fill;
			}
		}
		expect(worst, `worst at ${worstAt}`).toBeGreaterThanOrEqual(4.5);
	});

	test('is the one of the two that contrasts more, not the one a threshold guessed', () => {
		// A vivid cyan: light by luminance, middling by OKLCH lightness. The old
		// rule gave it white ink; black is the one that can be read.
		expect(pillInk('#22d3ee')).toBe(PILL_INK_SOFT);
		// And a deep indigo, where the same comparison says the opposite.
		expect(pillInk('#312e81')).toBe(PILL_INK_LIGHT);
	});

	test('gives up the softer dark where it would not be readable', () => {
		// `#c34bb4` is the colour that found this: the near-black ink's own
		// luminance drops the floor to 4.13:1, and plain black clears it.
		expect(pillInk('#c34bb4')).toBe(PILL_INK_DARK);
		expect(contrastRatio('#c34bb4', PILL_INK_SOFT)).toBeLessThan(4.5);
	});

	test('says nothing at all about something that is not a colour', () => {
		for (const said of ['', 'var(--control-on)', 'rebeccapurple', '#12345', null, undefined])
			expect(pillInk(said as string | null | undefined)).toBeNull();
	});

	test('and the style it writes carries both halves together', () => {
		expect(pillStyle('#22d3ee')).toBe(`--pill:#22d3ee;--pill-ink:${PILL_INK_SOFT}`);
		// A colour this cannot read still paints the pill; the stylesheet's own
		// rule inks it, which is worse than this and better than nothing.
		expect(pillStyle('var(--control-on)')).toBe('--pill:var(--control-on)');
		expect(pillStyle(null)).toBeUndefined();
	});
});
