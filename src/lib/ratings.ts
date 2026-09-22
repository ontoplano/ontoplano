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
export const RATINGS = ['urgency', 'ease', 'interest'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_MIN = 0;
export const RATING_MAX = 5;

export type RatingValues = Record<Rating, number | null>;

/**
 * What a rating nobody set counts as: 2.5, dead centre of nought to five.
 *
 * Not a zero — zero is a real answer now, the bottom of the scale, and "no
 * urgency at all" is a thing somebody can mean. Not a three either. It is the
 * exact middle, which is the honest expectation for a number nobody has
 * chosen, and it leaves three answers below it and three above.
 *
 * What that buys is the shape of the scale: 0, 1 and 2 put a task below
 * everything unrated, so they mean "later", "later still" and "not really" —
 * rather than several flavours of the same shrug — while 3, 4 and 5 are above
 * it.
 *
 * It is also the only half-step on the scale, which is what lets it be the
 * slider's resting place: the thumb sits between two marks, where no answer
 * can be mistaken for one.
 *
 * One number, once. It used to be 2.5 or 3.5 depending on which way that
 * particular rating ran, which is a rule every screen had to know and which
 * went away when ease replaced energy and all three began running the same way.
 */
export const RATING_UNRATED = (RATING_MIN + RATING_MAX) / 2;

/** Kept for what still reads "the middle": the same number. */
export const RATING_MIDPOINT = RATING_UNRATED;

/** What a rating counts as when it is compared: its value, or the unrated one. */
export function ratingWeight(value: number | null): number {
	return value ?? RATING_UNRATED;
}

/** One rating, best first — and best is the higher number, for all three. */
export function compareByRating(a: number | null, b: number | null): number {
	return ratingWeight(b) - ratingWeight(a);
}

/**
 * The order "what should I be doing" is answered in — and the only order there is.
 *
 * Most urgent first; between two equally urgent, the easiest; between two of
 * those, the one you would rather do. Ties past that are not this function's
 * business — the caller falls back to its own order.
 *
 * `RATINGS` itself, rather than a second list beside it. They were two, in two
 * different orders: the sort read urgency, ease, interest while every form and
 * every legend listed urgency, interest, ease — so the same three questions
 * came in one order on the card and another on the screen that sets them. One
 * name is an alias for the other so that cannot happen again.
 */
export const RATING_ORDER: readonly Rating[] = RATINGS;

export function compareByRatings(a: RatingValues, b: RatingValues): number {
	for (const rating of RATING_ORDER) {
		const said = compareByRating(a[rating], b[rating]);
		if (said !== 0) return said;
	}
	return 0;
}

/**
 * The whole order, ties included: the ratings, then the older task.
 *
 * Three tasks answered the same way have to come out in *some* order, and
 * until now each caller chose its own — `sortOrder`, which is the manual drag
 * position and is nought for everything nobody has dragged, so the answer came
 * from whatever order the query happened to return.
 *
 * Oldest first, deliberately. Two tasks that are alike in every way you have
 * described differ in one way you have not: one has been waiting longer. That
 * is the one being neglected, and newest-first would bury it for good.
 *
 * `sortOrder` still comes first among the ties, because dragging a task
 * somewhere is a person saying where it goes and outranks anything inferred.
 */
export function compareByPriority(
	a: { ratings: RatingValues; sortOrder?: number; createdAt?: string },
	b: { ratings: RatingValues; sortOrder?: number; createdAt?: string }
): number {
	const byRatings = compareByRatings(a.ratings, b.ratings);
	if (byRatings !== 0) return byRatings;

	const byHand = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
	if (byHand !== 0) return byHand;

	return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
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
