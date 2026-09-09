/**
 * A rhythm starts on a day, and nothing happens before it.
 *
 * `weekly` and `monthly` used to carry no start date, so "every week on
 * Saturday" was a claim about every Saturday there has ever been. Walking the
 * plan back a month generated a routine invented in September onto days in
 * August: a past that never happened, sitting in the record beside one that
 * did.
 *
 * Three things are tested here, because the bug needs all three to stay fixed:
 * the rule refuses dates before its anchor, generation therefore stops filling
 * the past, and a rule written before any of this existed still means what it
 * always meant rather than disappearing.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	occursOn,
	parseRecurrence,
	serialiseRecurrence,
	type Recurrence
} from '../src/lib/recurrence';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const day = (iso: string) => new Date(`${iso}T12:00:00`);

/** 2026-09-05 and 2026-09-12 are Saturdays; weekday 5 is Saturday here. */
const SATURDAY = 5;

describe('the rule itself', () => {
	test('a weekly rhythm ignores the Saturdays before it started', () => {
		const r = parseRecurrence('weekly:2026-09-09');

		expect(occursOn(r, day('2026-09-05'), SATURDAY)).toBe(false);
		expect(occursOn(r, day('2026-09-12'), SATURDAY)).toBe(true);
		expect(occursOn(r, day('2026-09-19'), SATURDAY)).toBe(true);
	});

	test('the anchor is inclusive — the day it starts is an occurrence', () => {
		// 2026-09-12 is itself a Saturday: a rhythm that starts today happens
		// today, which is what "counting from" says.
		const r = parseRecurrence('weekly:2026-09-12');

		expect(occursOn(r, day('2026-09-12'), SATURDAY)).toBe(true);
	});

	test('a monthly rhythm ignores the months before it started', () => {
		const r = parseRecurrence('monthly:1:2026-09-09');

		expect(occursOn(r, day('2026-08-01'), 0)).toBe(false);
		expect(occursOn(r, day('2026-09-01'), 0)).toBe(false);
		expect(occursOn(r, day('2026-10-01'), 0)).toBe(true);
	});

	test('a rule written before start dates existed still matches everything', () => {
		// The old serialised forms. Nothing degrades them into a slot that has
		// stopped happening, which would be the one unacceptable outcome.
		expect(occursOn(parseRecurrence('weekly'), day('2020-01-04'), SATURDAY)).toBe(true);
		expect(occursOn(parseRecurrence('monthly:1'), day('2020-01-01'), 0)).toBe(true);
	});

	test('every shape round-trips, with and without a start date', () => {
		const forms = [
			'weekly',
			'weekly:2026-09-09',
			'weeks:2:2026-09-09',
			'days:3:2026-09-09',
			'monthly:1',
			'monthly:31:2026-09-09'
		];

		for (const form of forms) {
			expect(serialiseRecurrence(parseRecurrence(form)), form).toBe(form);
		}
	});

	test('a start date that is not a date is dropped, not fatal', () => {
		// The rule is still the rule; it simply has no day it counts from. The
		// every-N shapes are the exception — they are counted *from* the anchor,
		// so without one there is nothing to count and they fall back to weekly.
		expect(parseRecurrence('weekly:not-a-date')).toEqual({ kind: 'weekly' });
		expect(parseRecurrence('monthly:5:not-a-date')).toEqual({ kind: 'monthly', day: 5 });
		expect(parseRecurrence('weeks:2:not-a-date')).toEqual({ kind: 'weekly' });
	});

	test('dragging one occurrence does not rewrite when the rhythm began', () => {
		// Only true of the shapes whose weekday carries the move. An every-N
		// rhythm has nothing else to count from, so its anchor does move.
		const weekly: Recurrence = { kind: 'weekly', anchor: '2026-09-09' };
		expect(serialiseRecurrence(weekly)).toBe('weekly:2026-09-09');
	});
});

describe('and so the past stops filling up', () => {
	const database = makeDatabase();
	seedAccounts(database.path);
	afterAll(() => database.remove());

	type Services = {
		slots: typeof import('../src/lib/server/services/slots');
		instances: typeof import('../src/lib/server/services/instances');
		activities: typeof import('../src/lib/server/services/activities');
	};

	let s: Services;
	const ctx = { userId: OWNER, now: new Date('2026-09-09T12:00:00'), tz: 'UTC' };

	beforeAll(async () => {
		s = {
			slots: await import('../src/lib/server/services/slots'),
			instances: await import('../src/lib/server/services/instances'),
			activities: await import('../src/lib/server/services/activities')
		};

		const category = s.activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
		s.slots.createSlot(ctx, {
			weekday: SATURDAY,
			startTime: '12:15',
			durationMinutes: 105,
			mode: 'category',
			categoryId: category,
			label: 'Lunch',
			// Written down today, as the form now always says.
			recurrence: 'weekly:2026-09-09'
		});
	});

	test('walking back a month generates nothing before the block existed', () => {
		const made = s.instances.generateInstances(
			ctx,
			new Date('2026-08-01T00:00:00'),
			new Date('2026-09-09T00:00:00')
		);

		expect(made).toBe(0);
		expect(
			s.instances.listInstances(
				ctx,
				new Date('2026-08-01T00:00:00'),
				new Date('2026-09-09T00:00:00')
			)
		).toEqual([]);
	});

	test('and the Saturdays after it do appear', () => {
		s.instances.generateInstances(
			ctx,
			new Date('2026-09-09T00:00:00'),
			new Date('2026-09-30T00:00:00')
		);

		const days = s.instances
			.listInstances(ctx, new Date('2026-09-09T00:00:00'), new Date('2026-09-30T00:00:00'))
			.map((i) => i.scheduledAt.slice(0, 10));

		expect(days).toEqual(['2026-09-12', '2026-09-19', '2026-09-26']);
	});
});
