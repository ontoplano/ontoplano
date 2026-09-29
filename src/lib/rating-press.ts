import { RATING_MAX, RATING_ORDER, type Rating } from './ratings';

/**
 * Which rating a press on the bars means, and to what.
 *
 * The bars nest from one bottom-right corner — urgency three columns wide at
 * the back, ease two, interest one in front — with a strip of ground one
 * column wide to their left (`RatingBadges`). So across the group there are
 * four equal columns: the strip and the first belong to urgency, which is the
 * only bar showing there; then ease; then interest. Up the group, the height
 * pressed is the value: the bottom fifth is a 1, the top fifth a 5.
 *
 * `x` and `y` are fractions of the group's box, measured from its top-left.
 */
export function ratingAtPoint(x: number, y: number): { rating: Rating; value: number } {
	const columns = RATING_ORDER.length + 1;
	const column = Math.min(columns - 1, Math.max(0, Math.floor(x * columns)));
	const rating = RATING_ORDER[Math.max(0, column - 1)];
	const value = Math.min(RATING_MAX, Math.max(1, Math.ceil((1 - y) * RATING_MAX)));
	return { rating, value };
}
