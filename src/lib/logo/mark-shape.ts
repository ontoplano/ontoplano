/**
 * The mark's own outline, measured from `mark.png` by `yarn icons`.
 *
 * Do not edit: replace the logo and run `yarn icons` instead. It is what lets
 * the phone bar's raised button be the shape of the mark rather than a circle
 * with the mark inside it.
 */
export const MARK_CLIP_PATH =
	'polygon(14.31% 14.71%, 50.00% 0.00%, 85.49% 14.51%, 100.00% 50.00%, 85.49% 85.49%, 50.00% 100.00%, 14.31% 85.29%, 0.00% 50.98%)';

/**
 * The same outline as SVG polygon points, centred on nothing at a given
 * radius.
 *
 * The clip path above is percentages of a box, which is what CSS wants; an
 * `<svg>` drawing the mark's shape around a centre wants numbers either side
 * of zero. Derived rather than written out again: there is one outline, it is
 * measured from the picture, and a second copy of it would be a second thing
 * to redraw when the logo changes.
 */
export function markPoints(radius: number): string {
	return (MARK_CLIP_PATH.match(/[\d.]+%\s+[\d.]+%/g) ?? [])
		.map((pair) => {
			const [x, y] = pair.split(/\s+/).map((n) => parseFloat(n) / 100);
			return `${((x - 0.5) * 2 * radius).toFixed(2)},${((y - 0.5) * 2 * radius).toFixed(2)}`;
		})
		.join(' ');
}
