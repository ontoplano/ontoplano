/**
 * The order "what should I be doing" is answered in.
 *
 * Three numbers, all of them running the same way: five is the most of what
 * the word says, so the best task is the most urgent, then the easiest, then
 * the one most wanted. Ease used to be `energy` and ran backwards, which meant
 * every piece of ordering had to carry "and which way does this one go" — and
 * an unrated task landed on a different number depending on which question it
 * was.
 *
 * The interesting case is still the fourth one: a rating nobody set. It is not
 * a zero and it is not a five; it is 2.5 — half a step below the middle, so a
 * task somebody deliberately marked 3 beats one nobody weighed. So 3, 4 and 5
 * beat it and 1 and 2 fall below it, on all three alike, which is what makes a
 * low rating mean "later" rather than being indistinguishable from a shrug.
 *
 * These numbers are pinned here rather than left to whatever a sort happens to
 * do, because three screens and an MCP tool all claim to use them.
 */
import { describe, expect, test } from 'vitest';

import {
	RATING_MAX,
	RATING_MIN,
	RATING_UNRATED,
	compareByRatings,
	ratingWeight,
	type RatingValues
} from '../src/lib/ratings';

const rated = (urgency: number | null, ease: number | null, interest: number | null) =>
	({ urgency, ease, interest }) as RatingValues;

/** Best first, the way `up_next` sorts. */
const order = (tasks: [string, RatingValues][]) =>
	[...tasks].sort((a, b) => compareByRatings(a[1], b[1])).map(([name]) => name);

describe('what an unset rating counts as', () => {
	test('is 2.5, the same for every one of them', () => {
		expect(ratingWeight(null)).toBe(RATING_UNRATED);
		// Half a step below the middle of a one-to-five scale, and one number
		// rather than one per rating — which is what ease running the same way
		// as the other two bought.
		expect(RATING_UNRATED).toBe(2.5);
	});

	test('so 3 beats it, and 1 and 2 fall below it', () => {
		expect(
			order([
				['unrated', rated(null, null, null)],
				['middling', rated(3, 3, 3)]
			])
		).toEqual(['middling', 'unrated']);

		// "Later" and "later still", rather than two flavours of the same shrug.
		for (const urgency of [RATING_MIN, 2])
			expect(
				order([
					['unrated', rated(null, null, null)],
					['low', rated(urgency, 3, 3)]
				])
			).toEqual(['unrated', 'low']);

		// And the same at the bottom of ease, which no longer needs its own rule.
		for (const ease of [RATING_MIN, 2])
			expect(
				order([
					['unrated', rated(3, null, null)],
					['draining', rated(3, ease, 3)]
				])
			).toEqual(['unrated', 'draining']);
	});

	test('while a rating that was actually set outranks it either way', () => {
		expect(
			order([
				['unrated', rated(3, null, 3)],
				['easy', rated(3, RATING_MAX, 3)]
			])
		).toEqual(['easy', 'unrated']);
	});
});

describe('the order the three are read in', () => {
	test('is urgency, then the easier task, then the one most wanted', () => {
		expect(
			order([
				['dull but urgent', rated(5, 4, 1)],
				['heavy and urgent', rated(5, 2, 5)],
				['wanted, not urgent', rated(2, 5, 5)]
			])
		).toEqual(['dull but urgent', 'heavy and urgent', 'wanted, not urgent']);
	});

	test('and ease only decides once urgency has not', () => {
		// A draining task that matters today still comes before an easy one
		// that does not.
		expect(
			order([
				['easy, whenever', rated(1, 5, 5)],
				['draining, now', rated(5, 1, 1)]
			])
		).toEqual(['draining, now', 'easy, whenever']);
	});

	test('and interest breaks what is left', () => {
		expect(
			order([
				['a chore', rated(4, 4, 1)],
				['want to', rated(4, 4, 5)]
			])
		).toEqual(['want to', 'a chore']);
	});

	test('says nothing about two tasks rated the same', () => {
		expect(compareByRatings(rated(3, 3, 3), rated(3, 3, 3))).toBe(0);
	});
});
