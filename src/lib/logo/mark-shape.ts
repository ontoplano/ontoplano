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

/**
 * The same dark, lifted — what the mark wears where it stands for a copy
 * that is not the ordinary one.
 *
 * `MARK_FIELD_LIFT` in brand.ts is how far; this is the answer for this
 * artwork, so the app and the icons paint the same colour. Anywhere the
 * field is painted beside a drained mark wants this one instead.
 */
export const MARK_FIELD_LIFTED = '#3d454b';

/**
 * Where the ring's inner edge is, as a fraction of the half width — the
 * largest disc inside the mark that is nothing but field.
 *
 * The layer that turns while the app waits is cut to it: everything the
 * mark carries inside is whole within this circle, and the circle itself
 * falls where the drawing is the same at any angle, so the cut cannot be
 * seen however far it has turned.
 */
export const MARK_INNER = 0.7344;
