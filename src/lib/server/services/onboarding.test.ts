import { describe, expect, it } from 'vitest';
import { TEMPLATES, TEMPLATE_KEYS } from './onboarding.js';

/**
 * What a starter week has to be true of.
 *
 * Onboarding promises a populated week, and the day it has to populate first
 * is today — whichever day that is. Two of the three templates left a weekend
 * day empty (Student had nothing on Saturday, Remote worker nothing on
 * Sunday), so anybody signing up on the wrong day of the week met an empty
 * dashboard on their very first visit. It also made `e2e/reminders.e2e.ts`
 * fail every Sunday, because a fresh account had no block to hang a reminder
 * on.
 *
 * Blank is exempt by name: an empty week is the whole point of it.
 */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

describe('the starter weeks', () => {
	const populated = TEMPLATES.filter((t) => t.key !== 'blank');

	it('offers exactly the templates it advertises', () => {
		expect(TEMPLATES.map((t) => t.key).sort()).toEqual([...TEMPLATE_KEYS].sort());
	});

	for (const template of TEMPLATES.filter((t) => t.key !== 'blank')) {
		it(`${template.key} puts something on every day of the week`, () => {
			const empty = DAYS.filter(
				(_, weekday) => !template.blocks.some((b) => b.weekday === weekday)
			);
			expect(empty, `${template.label} has nothing on ${empty.join(', ')}`).toEqual([]);
		});

		it(`${template.key} names only activities it also creates`, () => {
			const known = new Set(template.activities.map((a) => a.name));
			const unknown = [...new Set(template.blocks.map((b) => b.activity))].filter(
				(name) => !known.has(name)
			);
			expect(unknown).toEqual([]);
		});

		it(`${template.key} files every activity under a category it creates`, () => {
			const known = new Set(template.categories.map((c) => c.name));
			const unknown = template.activities.map((a) => a.category).filter((c) => !known.has(c));
			expect(unknown).toEqual([]);
		});
	}

	it('has a blank template that really is blank', () => {
		const blank = TEMPLATES.find((t) => t.key === 'blank');
		expect(blank?.blocks).toEqual([]);
	});

	it('leaves no block outside the week or the clock', () => {
		for (const t of populated) {
			for (const b of t.blocks) {
				expect(b.weekday, `${t.key}`).toBeGreaterThanOrEqual(0);
				expect(b.weekday, `${t.key}`).toBeLessThanOrEqual(6);
				expect(b.startTime, `${t.key} ${b.activity}`).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
				expect(b.durationMinutes, `${t.key} ${b.activity}`).toBeGreaterThan(0);
			}
		}
	});
});
