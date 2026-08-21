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

export const RATING_LABELS: Record<Rating, string> = {
	urgency: 'Urgency',
	interest: 'Interest',
	energy: 'Energy'
};

export const RATING_HINTS: Record<Rating, string> = {
	urgency: 'How soon this has to happen',
	interest: 'How much you want to do it',
	energy: 'How much it will take out of you'
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
