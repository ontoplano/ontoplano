import { MARK_CLIP_PATH, MARK_INNER } from './mark-shape.js';

/**
 * The mark's outline as numbers, for the places that draw it rather than clip
 * to it.
 *
 * Its own file because `mark-shape.ts` is written by `yarn icons` every time
 * the logo changes — a helper kept in there is a helper that disappears the
 * next time somebody replaces the picture, which is exactly what happened once.
 * The generated file holds measurements; this one holds the arithmetic.
 */

/** The corners, around a centre at 0,0, at the given radius. */
export function markCorners(radius: number): { x: number; y: number }[] {
	return (MARK_CLIP_PATH.match(/[\d.]+%\s+[\d.]+%/g) ?? []).map((pair) => {
		const [x, y] = pair.split(/\s+/).map((n) => parseFloat(n) / 100);
		return { x: (x - 0.5) * 2 * radius, y: (y - 0.5) * 2 * radius };
	});
}

/** The same, as an SVG `points` attribute. */
export function markPoints(radius: number): string {
	return markCorners(radius)
		.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
		.join(' ');
}

/** The same, as a closed SVG path — for the places that need two of them. */
export function markPath(radius: number): string {
	const corners = markCorners(radius);
	return `${corners.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`;
}

/**
 * How far inside the ring's inner edge the turning layer is cut.
 *
 * `MARK_INNER` is the largest circle on which every pixel measured as field,
 * so a cut exactly there sits on the last of it and picks up the artwork's
 * anti-aliasing as it comes round. A couple of per cent inside is still field
 * everywhere and still outside anything the mark carries.
 */
const TURN_INSET = 0.02;

/**
 * The part of the mark that turns, as a fraction of its half width.
 *
 * While the app waits, what the mark carries inside spins and the rim stands
 * still. The turning layer is a disc — a disc turns in place with nothing to
 * clip or reveal — cut inside the ring, where the drawing is flat dark field
 * and therefore the same at any angle, so the cut is invisible.
 *
 * Cut to the ring rather than to the middle. It used to be the measured
 * medallion plus a margin, which holds only while the middle of the mark IS a
 * medallion: give the app a logo whose middle is a drawing and that disc lands
 * inside the drawing, turning a circular hole in it. The ring's inner edge is
 * the general answer — a medallion is inside it too.
 */
export const MARK_TURN_RADIUS = MARK_INNER - TURN_INSET;
