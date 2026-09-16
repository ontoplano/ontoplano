/**
 * The mark's own outline, measured from `mark.png` by `yarn icons`.
 *
 * Do not edit: replace the logo and run `yarn icons` instead. It is what lets
 * the phone bar's raised button be the shape of the mark rather than a circle
 * with the mark inside it.
 */
export const MARK_CLIP_PATH =
	'polygon(14.51% 16.86%, 49.80% 0.00%, 84.71% 16.08%, 99.61% 50.00%, 85.69% 84.90%, 49.80% 100.00%, 13.33% 84.71%, 0.39% 50.20%)';

/**
 * How much of the mark's half width its middle takes, and what colour each
 * side of its ring is.
 *
 * The section wheel is this drawing at two hundred and ninety pixels: the
 * ring is the wheel's rim, and the middle is the hole you let go in to
 * change your mind. Measured rather than typed, for the same reason the
 * outline is.
 */
export const MARK_MIDDLE = 0.1563;

export const MARK_EDGE_COLOURS = [
	'#e2281e',
	'#f75c01',
	'#fdb304',
	'#84b73d',
	'#20accb',
	'#366cd8',
	'#754ebf',
	'#d93a96'
] as const;

/**
 * The dark field between the middle and the ring — the ground the mark
 * carries inside itself. The phone bar wears it, so the mark's field
 * flows into the bar instead of ending at an edge.
 */
export const MARK_FIELD = '#232c32';
