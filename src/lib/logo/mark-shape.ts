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

/**
 * What the mark carries inside its ring, traced into closed outlines.
 *
 * In a 24-unit box, which is the size of Android's status bar icon — the
 * one place that gets the drawing and not the picture, because that bar
 * keeps a small icon's alpha and throws its colours away. It used to show
 * the octagon with a dot in the middle: derived from the mark, and not
 * recognisable as it.
 *
 * Even-odd: the loops after the first are the gaps inside the drawing —
 * the bird's eye — and under that rule they are holes.
 */
export const MARK_DRAWING = [
	'M11.34,6.66 L13.03,6.75 L14.34,7.41 L15.28,8.44 L15.75,9.66 L18.28,11.81 L13.78,15.09 L12.94,15.09 L11.44,14.34 L10.78,13.59 L10.22,12.09 L10.31,10.88 L10.88,9.75 L11.44,9.19 L12.28,8.72 L14.16,8.44 L13.41,8.16 L11.81,8.25 L10.03,9.19 L8.44,11.06 L7.78,12.38 L7.41,14.06 L7.22,13.78 L7.22,11.53 L7.69,10.13 L8.16,9.38 L7.97,9.19 L6.94,9.84 L7.22,9.19 L9.09,7.41 L10.41,6.84 L11.25,6.75 Z',
	'M13.97,10.03 L14.44,10.22 L14.25,10.69 L13.78,10.59 L13.88,10.13 Z'
] as const;
