/**
 * The pie's geometry, which is a claim about where a thumb lands.
 *
 * It used to run clockwise from twelve o'clock, which is how a clock works and
 * not how a hand does: the pie opens above the button in the middle of the
 * phone's bar, and the shortest movement from there is up and slightly right.
 * So the first wedge is the one at the bottom right and the order runs
 * anti-clockwise from it — and that ordering is now also what somebody drags
 * into place in Preferences, which is why it is worth pinning.
 */
import { describe, expect, test } from 'vitest';
import { START_ANGLE, wedgeAt, wedgeCentre, wedgeEdges, wedgeStep } from '../src/lib/radial';

/** A point at `angle`, one unit from the centre, in screen coordinates. */
const at = (angle: number) => ({ dx: Math.cos(angle), dy: Math.sin(angle) });

describe('where the wedges are', () => {
	test('the first one is under a right thumb: bottom, just to the right', () => {
		const centre = wedgeCentre(0, 8);
		const { dx, dy } = at(centre);
		expect(dx).toBeGreaterThan(0); // right of the middle
		expect(dy).toBeGreaterThan(0); // below it (y grows downwards)
	});

	test('and the order climbs the right-hand side, not the left', () => {
		// Anti-clockwise in screen coordinates means the second wedge is higher
		// than the first while still on the right.
		const first = at(wedgeCentre(0, 8));
		const second = at(wedgeCentre(1, 8));
		expect(second.dy).toBeLessThan(first.dy);
		expect(second.dx).toBeGreaterThan(0);
	});

	test('the wedges tile the circle exactly once', () => {
		for (const count of [3, 4, 6, 8, 10]) {
			expect(wedgeStep(count) * count).toBeCloseTo(Math.PI * 2, 10);
			// Each wedge's far edge is the next one's near edge.
			for (let i = 0; i < count - 1; i++) {
				expect(wedgeEdges(i, count).to).toBeCloseTo(wedgeEdges(i + 1, count).from, 10);
			}
		}
	});
});

describe('the hit test agrees with the drawing', () => {
	test('the middle of every wedge selects that wedge', () => {
		for (const count of [3, 4, 5, 8, 10]) {
			for (let i = 0; i < count; i++) {
				const { dx, dy } = at(wedgeCentre(i, count));
				expect(wedgeAt(dx, dy, count)).toBe(i);
			}
		}
	});

	test('and so does a point just inside either edge', () => {
		const count = 8;
		const nudge = wedgeStep(count) / 100;
		for (let i = 0; i < count; i++) {
			const { from, to } = wedgeEdges(i, count);
			const near = at(from - nudge);
			const far = at(to + nudge);
			expect(wedgeAt(near.dx, near.dy, count)).toBe(i);
			expect(wedgeAt(far.dx, far.dy, count)).toBe(i);
		}
	});

	test('straight down is the start of the first wedge', () => {
		const { dx, dy } = at(START_ANGLE);
		expect(wedgeAt(dx, dy, 8)).toBe(0);
	});

	test('and nothing is selected when there is nothing to select', () => {
		expect(wedgeAt(1, 1, 0)).toBe(-1);
	});
});
