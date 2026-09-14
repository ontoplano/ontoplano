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
 * How much of the mark's half width its middle takes, and what colour each
 * side of its ring is.
 *
 * The section wheel is this drawing at two hundred and ninety pixels: the
 * ring is the wheel's rim, and the middle is the hole you let go in to
 * change your mind. Measured rather than typed, for the same reason the
 * outline is.
 */
export const MARK_MIDDLE = 0.5156;

export const MARK_EDGE_COLOURS = [
	'#cc251b',
	'#e05302',
	'#e5a204',
	'#78a637',
	'#1e9cb8',
	'#3364c2',
	'#6746ab',
	'#c43587'
] as const;

/**
 * The dark field between the middle and the ring — the ground the mark
 * carries inside itself. The phone bar wears it, so the mark's field
 * flows into the bar instead of ending at an edge.
 */
export const MARK_FIELD = '#20282f';
