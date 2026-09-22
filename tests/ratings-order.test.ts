/**
 * The order "what should I be doing" is answered in.
 *
 * Three numbers, and one of them runs backwards: energy is what a task takes
 * out of you, so less is better. The interesting part is the fourth case —
 * a rating nobody set. It is not a zero and it is not a five; it is the middle
 * of the scale, moved half a step to the losing side so that a task somebody
 * deliberately marked 3 beats one nobody weighed.
 *
 * What that buys is the shape of the scale, and it is the reason these numbers
 * are pinned here rather than left to whatever a sort happens to do: 1 and 2
 * for urgency fall below everything unrated, so they mean "later" and "later
 * still" rather than two flavours of the same shrug, and 4 and 5 for energy do
 * the same job at the other end.
 */
import { describe, expect, test } from 'vitest';

import {
	RATING_MAX,
	RATING_MIDPOINT,
	RATING_MIN,
	compareByRatings,
	ratingWeight,
	type RatingValues
} from '../src/lib/ratings';

const rated = (urgency: number | null, energy: number | null, interest: number | null) =>
	({ urgency, energy, interest }) as RatingValues;

/** Best first, the way `up_next` sorts. */
const order = (tasks: [string, RatingValues][]) =>
	[...tasks].sort((a, b) => compareByRatings(a[1], b[1])).map(([name]) => name);

describe('what an unset rating counts as', () => {
	test('is half a step worse than the middle, whichever way the rating runs', () => {
		expect(ratingWeight('urgency', null)).toBe(RATING_MIDPOINT - 0.5);
		expect(ratingWeight('interest', null)).toBe(RATING_MIDPOINT - 0.5);
		expect(ratingWeight('energy', null)).toBe(RATING_MIDPOINT + 0.5);
	});

	test('so a deliberate middle beats it, and the far tiers lose to it', () => {
		expect(
			order([
				['unrated', rated(null, null, null)],
				['middling', rated(3, 3, 3)]
			])
		).toEqual(['middling', 'unrated']);
		// Urgency 1 and 2 are "later" and "later still": both below unrated.
		for (const urgency of [RATING_MIN, 2])
			expect(
				order([
					['unrated', rated(null, null, null)],
					['low', rated(urgency, 3, 3)]
				])
			).toEqual(['unrated', 'low']);
		// And at the other end, energy 4 and 5 say the same thing.
		for (const energy of [4, RATING_MAX])
			expect(
				order([
					['unrated', rated(3, null, null)],
					['draining', rated(3, energy, 3)]
				])
			).toEqual(['unrated', 'draining']);
	});

	test('while a rating that was actually set outranks it either way', () => {
		expect(
			order([
				['unrated', rated(3, null, 3)],
				['easy', rated(3, 1, 3)]
			])
		).toEqual(['easy', 'unrated']);
	});
});

describe('the order the three are read in', () => {
	test('is urgency, then the lighter task, then the one most wanted', () => {
		expect(
			order([
				['dull but urgent', rated(5, 2, 1)],
				['heavy and urgent', rated(5, 4, 5)],
				['wanted, not urgent', rated(2, 1, 5)]
			])
		).toEqual(['dull but urgent', 'heavy and urgent', 'wanted, not urgent']);
	});

	test('and energy only decides once urgency has not', () => {
		// A draining task that matters today still comes before an easy one
		// that does not.
		expect(
			order([
				['easy, whenever', rated(1, 1, 5)],
				['draining, now', rated(5, 5, 1)]
			])
		).toEqual(['draining, now', 'easy, whenever']);
	});

	test('and interest breaks what is left', () => {
		expect(
			order([
				['a chore', rated(4, 2, 1)],
				['want to', rated(4, 2, 5)]
			])
		).toEqual(['want to', 'a chore']);
	});

	test('says nothing about two tasks rated the same', () => {
		expect(compareByRatings(rated(3, 3, 3), rated(3, 3, 3))).toBe(0);
	});
});
