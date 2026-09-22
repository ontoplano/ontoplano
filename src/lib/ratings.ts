import type { PlainKey } from './i18n/keys.js';
/**
 * The three questions a task answers besides "when".
 *
 * Urgency is how soon it matters, interest is how much you want to, energy is
 * how much it will take out of you. Together they answer the question a plain
 * list cannot: *what can I actually do right now* — low energy, high interest,
 * most urgent first.
 *
 * All three are optional. A task with no ratings is a perfectly good task, and
 * demanding three numbers before you can write one down is how a system stops
 * getting used.
 */
export const RATINGS = ['urgency', 'interest', 'energy'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export type RatingValues = Record<Rating, number | null>;

/**
 * Which way each rating reads.
 *
 * Urgency and interest are better the higher they are; energy is how much a
 * task will take out of you, so it is better the lower it is. Ordering by
 * "the best three numbers" means two of them descending and one ascending,
 * which is the detail everything that sorts by ratings gets wrong once.
 */
export const RATING_BETTER: Record<Rating, 'higher' | 'lower'> = {
	urgency: 'higher',
	interest: 'higher',
	energy: 'lower'
};

/** The middle of the scale: what a task rated neither high nor low sits at. */
export const RATING_MIDPOINT = (RATING_MIN + RATING_MAX) / 2;

/**
 * How far off the middle an unrated task sits — and why it sits off it at all.
 *
 * A task nobody has rated does not have a rating of zero; it has no rating,
 * and the honest expectation for a number somebody has not chosen is the
 * middle of the scale. But a task deliberately marked 3 should beat one nobody
 * weighed, so an unrated task is put half a step to the losing side of the
 * middle: 2.5 where high is good, 3.5 where low is good.
 *
 * What that buys is the shape of the scale. Marking a task 1 or 2 for urgency
 * puts it below everything unrated, so those two are "later" and "later still"
 * rather than two flavours of the same shrug — and on energy, where the order
 * is reversed, 4 and 5 do the same job.
 */
export const RATING_UNRATED_STEP = 0.5;

/** What a rating counts as when it is compared: its value, or the unrated one. */
export function ratingWeight(rating: Rating, value: number | null): number {
	if (value !== null) return value;
	return RATING_BETTER[rating] === 'higher'
		? RATING_MIDPOINT - RATING_UNRATED_STEP
		: RATING_MIDPOINT + RATING_UNRATED_STEP;
}

/** One rating, best first, whichever way that rating runs. */
export function compareByRating(rating: Rating, a: number | null, b: number | null): number {
	const difference = ratingWeight(rating, a) - ratingWeight(rating, b);
	return RATING_BETTER[rating] === 'higher' ? -difference : difference;
}

/**
 * The order "what should I be doing" is answered in.
 *
 * Most urgent first; between two equally urgent, the one that takes less out
 * of you; between two of those, the one you would rather do. Ties past that
 * are not this function's business — the caller falls back to its own order.
 */
export const RATING_ORDER: readonly Rating[] = ['urgency', 'energy', 'interest'];

export function compareByRatings(a: RatingValues, b: RatingValues): number {
	for (const rating of RATING_ORDER) {
		const said = compareByRating(rating, a[rating], b[rating]);
		if (said !== 0) return said;
	}
	return 0;
}

export const RATING_LABELS: Record<Rating, PlainKey> = {
	urgency: 'ratings.urgency',
	interest: 'ratings.interest',
	energy: 'ratings.energy'
};

export const RATING_HINTS: Record<Rating, PlainKey> = {
	urgency: 'ratings.howSoonThisHasTo',
	interest: 'ratings.howMuchYouWantTo',
	energy: 'ratings.howMuchItWillTake'
};

/** Single letters for the scale ends, for a control too small to hold words. */
export const RATING_SCALE_ENDS: Record<Rating, [string, string]> = {
	urgency: ['whenever', 'now'],
	interest: ['a chore', 'want to'],
	energy: ['easy', 'draining']
};

export function isRatingValue(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= RATING_MIN &&
		value <= RATING_MAX
	);
}

/**
 * Read a rating out of a form field.
 *
 * Returns `null` for an empty field, which is how a rating is cleared, and
 * `undefined` when the field was not submitted at all — a drag on the grid
 * posts placement only and must leave ratings untouched, the same distinction
 * `metaPatchFromFormData` makes.
 */
export function ratingFromForm(
	formData: { has: (k: string) => boolean; get: (k: string) => FormDataEntryValue | null },
	name: Rating
): number | null | undefined {
	if (!formData.has(name)) return undefined;
	const raw = formData.get(name)?.toString()?.trim();
	if (!raw) return null;
	const n = Number(raw);
	return isRatingValue(n) ? n : null;
}

/** All three at once, omitting the ones that were not submitted. */
export function ratingsFromForm(formData: {
	has: (k: string) => boolean;
	get: (k: string) => FormDataEntryValue | null;
}): Partial<RatingValues> {
	const out: Partial<RatingValues> = {};
	for (const r of RATINGS) {
		const v = ratingFromForm(formData, r);
		if (v !== undefined) out[r] = v;
	}
	return out;
}
