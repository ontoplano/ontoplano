/**
 * The period a goal lives in, the three numbers a task carries, and the
 * sections a person has put away.
 *
 * "Read 12 books" in 2026 and the same words in 2027 are two goals with their
 * own progress, not one that silently resets — so a goal is pinned to a period,
 * and this arithmetic is what decides which one. Getting it wrong does not
 * throw; it moves somebody's progress into the wrong year.
 *
 * The ratings have one distinction worth guarding: a field left empty clears a
 * rating, a field that was never submitted leaves it alone. Dragging a block on
 * the grid posts placement and nothing else, and it must not wipe three numbers
 * on the way past.
 */
import { describe, expect, test } from 'vitest';
import {
	canNestUnder,
	describePeriod,
	formatDate,
	HORIZONS,
	isGoalStatus,
	isHorizon,
	periodContains,
	periodEnd,
	periodStart
} from '../src/lib/goals';
import { isRatingValue, ratingFromForm, ratingsFromForm } from '../src/lib/ratings';
import { HIDEABLE_SECTIONS, isHideableSection } from '../src/lib/sections';
import { sectionFor, SECTION_COLORS, SECTIONS } from '../src/lib/colors';

/** A Wednesday, in the third quarter, second half of the year. */
const DAY = new Date('2026-08-19T15:00:00');

describe('the period containing a date', () => {
	test('is the day, the Monday, the first of the month', () => {
		expect(periodStart('day', DAY)).toBe('2026-08-19');
		expect(periodStart('week', DAY)).toBe('2026-08-17');
		expect(periodStart('month', DAY)).toBe('2026-08-01');
	});

	test('and the quarter, half and year it falls in', () => {
		expect(periodStart('quarter', DAY)).toBe('2026-07-01');
		expect(periodStart('semester', DAY)).toBe('2026-07-01');
		expect(periodStart('year', DAY)).toBe('2026-01-01');
	});

	test('the week runs Monday to Sunday, matching the planner', () => {
		// A Sunday belongs to the week that started six days earlier, not to the
		// one about to begin.
		expect(periodStart('week', new Date('2026-08-23T12:00:00'))).toBe('2026-08-17');
		expect(periodStart('week', new Date('2026-08-24T12:00:00'))).toBe('2026-08-24');
	});

	test('the first half of the year ends in June', () => {
		expect(periodStart('semester', new Date('2026-06-30T12:00:00'))).toBe('2026-01-01');
		expect(periodStart('semester', new Date('2026-07-01T12:00:00'))).toBe('2026-07-01');
	});

	test('and each quarter starts where the last one ended', () => {
		const starts = ['01', '04', '07', '10'];
		for (let month = 0; month < 12; month++) {
			const d = new Date(2026, month, 15);
			expect(periodStart('quarter', d)).toBe(`2026-${starts[Math.floor(month / 3)]}-01`);
		}
	});
});

describe('where a period ends', () => {
	test('is the day after, so a range check never double-counts a boundary', () => {
		expect(periodEnd('day', '2026-08-19')).toBe('2026-08-20');
		expect(periodEnd('week', '2026-08-17')).toBe('2026-08-24');
		expect(periodEnd('month', '2026-08-01')).toBe('2026-09-01');
		expect(periodEnd('quarter', '2026-07-01')).toBe('2026-10-01');
		expect(periodEnd('semester', '2026-07-01')).toBe('2027-01-01');
		expect(periodEnd('year', '2026-01-01')).toBe('2027-01-01');
	});

	test('and crosses a year without landing in the wrong one', () => {
		expect(periodEnd('month', '2026-12-01')).toBe('2027-01-01');
		expect(periodEnd('quarter', '2026-10-01')).toBe('2027-01-01');
	});

	test('every horizon covers its own start and stops before the next', () => {
		for (const horizon of HORIZONS) {
			const start = periodStart(horizon, DAY);
			expect(periodContains(horizon, start, start), horizon).toBe(true);
			expect(periodContains(horizon, start, periodEnd(horizon, start)), horizon).toBe(false);
			expect(periodContains(horizon, start, formatDate(DAY)), horizon).toBe(true);
		}
	});

	test('and a date before the period is outside it too', () => {
		expect(periodContains('month', '2026-08-01', '2026-07-31')).toBe(false);
	});
});

describe('how a period reads to a person', () => {
	test('says the quarter and half in the short forms people use', () => {
		expect(describePeriod('quarter', '2026-07-01')).toBe('Q3 2026');
		expect(describePeriod('semester', '2026-07-01')).toBe('H2 2026');
		expect(describePeriod('semester', '2026-01-01')).toBe('H1 2026');
		expect(describePeriod('year', '2026-01-01')).toBe('2026');
	});

	test('and names the month and week in words', () => {
		expect(describePeriod('month', '2026-08-01')).toContain('2026');
		expect(describePeriod('month', '2026-08-01')).toMatch(/august/i);
		expect(describePeriod('week', '2026-08-17')).toMatch(/^Week of /);
		expect(describePeriod('day', '2026-08-19')).toMatch(/2026/);
	});
});

describe('which goals can sit inside which', () => {
	test('a shorter horizon nests under a longer one', () => {
		expect(canNestUnder('week', 'year')).toBe(true);
		expect(canNestUnder('quarter', 'semester')).toBe(true);
	});

	test('and never the other way round, or under itself', () => {
		// The form offers only parents a goal could genuinely be part of.
		expect(canNestUnder('year', 'week')).toBe(false);
		expect(canNestUnder('month', 'month')).toBe(false);
	});
});

describe('what counts as a horizon or a status', () => {
	test('the ones the app defines, and nothing else', () => {
		expect(isHorizon('quarter')).toBe(true);
		expect(isHorizon('fortnight')).toBe(false);
		expect(isHorizon(null)).toBe(false);
		expect(isHorizon(3)).toBe(false);

		expect(isGoalStatus('achieved')).toBe(true);
		expect(isGoalStatus('nearly')).toBe(false);
		expect(isGoalStatus(undefined)).toBe(false);
	});
});

describe('the three numbers a task can carry', () => {
	test('are whole numbers on the scale, and nothing else', () => {
		expect(isRatingValue(1)).toBe(true);
		expect(isRatingValue(5)).toBe(true);
		expect(isRatingValue(0)).toBe(false);
		expect(isRatingValue(6)).toBe(false);
		expect(isRatingValue(3.5)).toBe(false);
		expect(isRatingValue('3')).toBe(false);
		expect(isRatingValue(null)).toBe(false);
	});

	test('a submitted value is read', () => {
		const form = new FormData();
		form.set('urgency', '4');
		expect(ratingFromForm(form, 'urgency')).toBe(4);
	});

	test('an empty field clears the rating', () => {
		const form = new FormData();
		form.set('urgency', '');
		expect(ratingFromForm(form, 'urgency')).toBeNull();
	});

	test('a field that was never submitted leaves the rating alone', () => {
		// This is the distinction that matters: a drag on the grid posts
		// placement only, and must not wipe three numbers on the way past.
		expect(ratingFromForm(new FormData(), 'urgency')).toBeUndefined();
	});

	test('and a value off the scale clears rather than storing nonsense', () => {
		const form = new FormData();
		form.set('energy', '9');
		expect(ratingFromForm(form, 'energy')).toBeNull();

		form.set('energy', 'lots');
		expect(ratingFromForm(form, 'energy')).toBeNull();
	});

	test('all three at once omit the ones nobody submitted', () => {
		const form = new FormData();
		form.set('urgency', '4');
		form.set('interest', '');

		expect(ratingsFromForm(form)).toEqual({ urgency: 4, interest: null });
	});

	test('and a task with no ratings at all is a perfectly good task', () => {
		expect(ratingsFromForm(new FormData())).toEqual({});
	});
});

describe('the sections a person can put away', () => {
	test('the planner and home are not among them', () => {
		// An account that hid the planner has hidden ontoplano.
		expect(isHideableSection('planner')).toBe(false);
		expect(isHideableSection('home')).toBe(false);
	});

	test('but the rooms somebody may never enter are', () => {
		expect(isHideableSection('diary')).toBe(true);
		expect(isHideableSection('recipes')).toBe(true);
		expect(isHideableSection('not-a-section')).toBe(false);
	});

	test('and each has a label to show in the settings list', () => {
		for (const section of HIDEABLE_SECTIONS) expect(section.label).toBeTruthy();
	});
});

describe('which section a page belongs to', () => {
	test('is read off the path, sub-pages included', () => {
		expect(sectionFor('/tasks')).toBe('planner');
		expect(sectionFor('/tasks/todo')).toBe('planner');
		expect(sectionFor('/shopping/list/3')).toBe('shopping');
		// Recipes and meals are Health's now; the old address redirects there.
		expect(sectionFor('/health/recipes')).toBe('health');
	});

	test('and anything else is home rather than nothing', () => {
		expect(sectionFor('/')).toBe('home');
		expect(sectionFor('/settings')).toBe('home');
	});

	test('every section has an accent, and the cards use the same ones', () => {
		// The colour is the section's identity: a card and its navbar entry
		// disagreeing is how the app stops feeling like one place.
		for (const [key, colour] of Object.entries(SECTION_COLORS)) {
			expect(colour, key).toMatch(/^#[0-9a-f]{6}$/i);
			expect(colour, key).toBe(SECTIONS[key as keyof typeof SECTIONS].accent);
		}
	});
});
