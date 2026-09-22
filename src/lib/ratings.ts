import type { PlainKey } from './i18n/keys.js';
/**
 * The three questions a task answers besides "when".
 *
 * Urgency is how soon it matters, interest is how much you want to, ease is
 * how little it will take out of you. Together they answer the question a
 * plain list cannot: *what can I actually do right now* — easiest, most
 * wanted, most urgent first.
 *
 * All three run the same way: five is the most of what the word says. Ease was
 * `energy` and ran backwards — five meant draining — which made every piece of
 * ordering ask "and which way does this one go", and made an unrated task sit
 * on a different side of the middle depending on which question it was. One
 * direction for all three is most of what this file used to be.
 *
 * All three are optional. A task with no ratings is a perfectly good task, and
 * demanding three numbers before you can write one down is how a system stops
 * getting used.
 */
export const RATINGS = ['urgency', 'interest', 'ease'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export type RatingValues = Record<Rating, number | null>;

/** The middle of the scale: three, on a scale of one to five. */
export const RATING_MIDPOINT = (RATING_MIN + RATING_MAX) / 2;

/**
 * What a rating nobody set counts as: 2.5, for every one of them.
 *
 * Not zero — a task nobody rated has no rating, and the honest expectation for
 * a number somebody has not chosen is about the middle. Not three either: a
 * task somebody deliberately marked 3 should beat one nobody weighed, so an
 * unrated one sits half a step below the middle.
 *
 * What that buys is the shape of the scale. Marking a task 1 or 2 puts it
 * below everything unrated, so those two mean "later" and "later still"
 * rather than two flavours of the same shrug, while 4 and 5 are above it.
 *
 * One number, once. It used to be 2.5 or 3.5 depending on which way that
 * particular rating ran, which is a rule every screen had to know and which
 * went away when ease replaced energy and all three began running the same
 * way.
 */
export const RATING_UNRATED = RATING_MIDPOINT - 0.5;

/** What a rating counts as when it is compared: its value, or the unrated one. */
export function ratingWeight(value: number | null): number {
	return value ?? RATING_UNRATED;
}

/** One rating, best first — and best is the higher number, for all three. */
export function compareByRating(a: number | null, b: number | null): number {
	return ratingWeight(b) - ratingWeight(a);
}

/**
 * The order "what should I be doing" is answered in.
 *
 * Most urgent first; between two equally urgent, the easiest; between two of
 * those, the one you would rather do. Ties past that are not this function's
 * business — the caller falls back to its own order.
 */
export const RATING_ORDER: readonly Rating[] = ['urgency', 'ease', 'interest'];

export function compareByRatings(a: RatingValues, b: RatingValues): number {
	for (const rating of RATING_ORDER) {
		const said = compareByRating(a[rating], b[rating]);
		if (said !== 0) return said;
	}
	return 0;
}

export const RATING_LABELS: Record<Rating, PlainKey> = {
	urgency: 'ratings.urgency',
	interest: 'ratings.interest',
	ease: 'ratings.ease'
};

export const RATING_HINTS: Record<Rating, PlainKey> = {
	urgency: 'ratings.howSoonThisHasTo',
	interest: 'ratings.howMuchYouWantTo',
	ease: 'ratings.howLittleEffortIt'
};

/** Single letters for the scale ends, for a control too small to hold words. */
export const RATING_SCALE_ENDS: Record<Rating, [string, string]> = {
	urgency: ['whenever', 'now'],
	interest: ['a chore', 'want to'],
	ease: ['draining', 'easy']
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
