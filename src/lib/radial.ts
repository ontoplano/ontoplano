/**
 * Where the wedges of the pie are, as arithmetic.
 *
 * Out of the component so it can be checked: "the first wedge is the one under
 * a right thumb" is a claim about numbers, and a claim about numbers that only
 * a screenshot can verify is one that quietly stops being true.
 *
 * ## Which way round, and why
 *
 * Screen coordinates put y downwards, so an angle of +π/2 points at six
 * o'clock and angles *increase* clockwise. The pie starts at six o'clock and
 * runs **anti-clockwise**: the first wedge is the one immediately to the right
 * of the bottom, then up the right-hand side, over the top, and down the left.
 *
 * That is where a right thumb already is. The pie opens above the button in
 * the middle of the phone's bar, and the shortest, surest movement from there
 * is up and slightly right — so the room somebody reaches for most should be
 * the one that movement lands on, and the order should carry on the way the
 * hand naturally sweeps.
 *
 * The consequence worth knowing: the order in Preferences is the order round
 * the ring from that corner. First in the list is first under the thumb.
 */

/** Six o'clock, in screen coordinates. Where wedge zero begins. */
export const START_ANGLE = Math.PI / 2;

const TAU = Math.PI * 2;

/** How wide one wedge is, in radians. */
export function wedgeStep(count: number): number {
	return TAU / Math.max(count, 1);
}

/**
 * The two edges of wedge `i`, anti-clockwise from six o'clock.
 *
 * `from` is the edge nearer six o'clock and `to` is the one further round;
 * `to` is the smaller number, because anti-clockwise is decreasing here.
 */
export function wedgeEdges(i: number, count: number): { from: number; to: number } {
	const step = wedgeStep(count);
	const from = START_ANGLE - i * step;
	return { from, to: from - step };
}

/** The middle of wedge `i` — where its icon and label sit. */
export function wedgeCentre(i: number, count: number): number {
	const step = wedgeStep(count);
	return START_ANGLE - (i + 0.5) * step;
}

/**
 * Which wedge a direction falls in.
 *
 * `dx`/`dy` are measured from the centre of the ring, in screen coordinates.
 * The inverse of `wedgeEdges`, and the pair is what `radial.test.ts` checks
 * against each other — a hit test that disagrees with the drawing is a menu
 * that does something other than what it is showing.
 */
export function wedgeAt(dx: number, dy: number, count: number): number {
	if (count <= 0) return -1;
	const step = wedgeStep(count);
	// How far anti-clockwise from the start this direction is, in [0, 2π).
	let sweep = (START_ANGLE - Math.atan2(dy, dx)) % TAU;
	if (sweep < 0) sweep += TAU;
	return Math.floor(sweep / step) % count;
}
