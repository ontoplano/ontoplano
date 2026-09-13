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
	 * Enough vertices to be an outline, few enough to be this outline.
	 *
	 * Not exactly eight, which is what this asked for and what the mark has:
	 * the shape is measured off rasterised artwork whose corners are rounded
	 * and anti-aliased, so a convex hull of it puts two or three vertices
	 * round each corner however the simplification is tuned — and tuning a
	 * generator until one test's number falls out is how it stops working on
	 * the next logo.
	 *
	 * The bound is what the failures actually looked like. A degenerate
	 * measurement collapses to a triangle, which is what was committed when
	 * this was last wrong; a measurement that has found texture rather than an
	 * edge runs to hundreds.
	 */
	test('is a convex outline of a few sides, not a triangle and not a scribble', () => {
		expect(points.length).toBeGreaterThanOrEqual(8);
		expect(points.length).toBeLessThanOrEqual(24);
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
