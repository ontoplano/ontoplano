import { MARK_CLIP_PATH, MARK_MIDDLE } from './mark-shape.js';

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
 * The part of the mark that turns, as a fraction of its half width.
 *
 * While the app waits, the medallion in the middle spins and the rim stands
 * still. The turning layer is a disc — a disc turns in place with nothing to
 * clip or reveal — cut just past the medallion's measured edge, well short of
 * the rim: everything in between is the flat dark field, which reads the same
 * at any angle, so the cut is invisible.
 */
export const MARK_TURN_RADIUS = MARK_MIDDLE + 0.08;
