/**
 * The shape the bar's button is clipped to is the shape of the mark.
 *
 * `MARK_CLIP_PATH` is measured from the artwork by `yarn icons`, and the day
 * the mark was first exported edge to edge rather than on a plate the
 * measurement quietly came back a sixth too small — the button shrank, its
 * points were cut off, and nothing failed. The polygon is a number this test
 * can read, so the shrink is a failing test rather than something to notice in
 * a screenshot.
 */
import { describe, expect, test } from 'vitest';

import { MARK_CLIP_PATH } from '../src/lib/logo/mark-shape';

const points = [...MARK_CLIP_PATH.matchAll(/([\d.]+)%\s+([\d.]+)%/g)].map(([, x, y]) => ({
	x: Number(x),
	y: Number(y)
}));

describe('the mark outline', () => {
	/*
	 * Eight, and it means eight.
	 *
	 * This was briefly relaxed to a range, on the evidence that the
	 * measurement put two or three vertices round each rounded corner however
	 * the simplification was tuned. It does — against the *previous* logo,
	 * which is what was in `mark.png` at the time, because a `git add -A` had
	 * put it back there. Against the real one the generator gives eight, as it
	 * always said it would.
	 *
	 * So the number stays exact. A relaxed assertion here would have let both
	 * of the failures through: the degenerate measurement that collapsed to a
	 * triangle, and the wrong logo underneath it.
	 */
	test('is an octagon', () => {
		expect(points).toHaveLength(8);
	});

	test('reaches the edges of the box it is given', () => {
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);

		// `make icon` normalises the artwork so the mark fills its own file; a
		// clip measured from it therefore spans the whole box. Anything much
		// inside that is the measurement having found a frame rather than the
		// mark, which is what draws the button too small.
		expect(Math.min(...xs)).toBeLessThan(2);
		expect(Math.max(...xs)).toBeGreaterThan(98);
		expect(Math.min(...ys)).toBeLessThan(2);
		expect(Math.max(...ys)).toBeGreaterThan(98);
	});

	test('stays inside it', () => {
		for (const { x, y } of points) {
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(100);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(100);
		}
	});
});
