/**
 * Pasting a week in, and the rules that repeat.
 *
 * The CSV import is the one place the planner takes a whole week from outside,
 * which means it takes whatever a spreadsheet produced: ragged rows, times
 * written as `610`, cells naming activities that do not exist here. Its job is
 * to keep going and to say what it did not recognise, because silently
 * dropping a cell is worse than importing it as a plain label.
 *
 * The recurrence rules are the other half: a block that repeats every N weeks
 * has to count from something, and a rule out of range must come back as plain
 * weekly rather than reaching the database.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let slots: typeof import('../src/lib/server/services/slots');
let activities: typeof import('../src/lib/server/services/activities');
let recurrence: typeof import('../src/lib/recurrence');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

beforeAll(async () => {
	slots = await import('../src/lib/server/services/slots');
	activities = await import('../src/lib/server/services/activities');
	recurrence = await import('../src/lib/recurrence');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
	activities.createActivity(ctx, { name: 'Deep work', categoryId: work });
});

const HEADER = 'h,d,m,t,w,t,f,s,s';

describe('pasting a week in', () => {
	test('reads a bare number as a time', () => {
		// 610 is ten past six, not six hundred and ten.
		const result = slots.importWeekCsv(ctx, {
			csv: `${HEADER}\n610,30,Deep work,,,,,,`,
			clearExisting: true
		});

		expect(result.imported).toBe(1);
		expect(slots.listWeeklySlots(ctx)[0].startTime).toBe('06:10');
	});

	test('matches an activity by name, whatever its case', () => {
		const result = slots.importWeekCsv(ctx, {
			csv: `${HEADER}\n900,60,DEEP WORK,,,,,,`,
			clearExisting: true
		});

		expect(result.unmatched).toEqual([]);
		expect(slots.listWeeklySlots(ctx)[0].mode).toBe('activity');
	});

	test('keeps a cell it does not recognise, as a label, and says so', () => {
		// Dropping it silently is the failure this avoids: somebody pasted a
		// week and would get most of it back with no idea what was missing.
		const result = slots.importWeekCsv(ctx, {
			csv: `${HEADER}\n1400,45,Alongar,,,,,,`,
			clearExisting: true
		});

		expect(result.imported).toBe(1);
		expect(result.unmatched).toEqual(['Alongar']);

		const block = slots.listWeeklySlots(ctx)[0];
		expect(block.mode).toBe('category');
		expect(block.label).toBe('Alongar');
	});

	test('puts each column on its own weekday and skips the empty cells', () => {
		const result = slots.importWeekCsv(ctx, {
			csv: `${HEADER}\n800,30,Deep work,,Deep work,,,,`,
			clearExisting: true
		});

		expect(result.imported).toBe(2);
		expect(
			slots
				.listWeeklySlots(ctx)
				.map((s) => s.weekday)
				.sort()
		).toEqual([0, 2]);
	});

	test('takes a default duration rather than refusing a blank one', () => {
		slots.importWeekCsv(ctx, {
			csv: `${HEADER}\n700,,Deep work,,,,,,`,
			clearExisting: true
		});
		expect(slots.listWeeklySlots(ctx)[0].durationMinutes).toBe(60);
	});

	test('walks past a row it cannot read instead of giving up on the sheet', () => {
		const result = slots.importWeekCsv(ctx, {
			csv: [HEADER, 'nonsense', '12', '900,30,Deep work,,,,,,'].join('\n'),
			clearExisting: true
		});
		expect(result.imported).toBe(1);
	});

	test('refuses a sheet with nothing in it', () => {
		expect(() => slots.importWeekCsv(ctx, { csv: HEADER })).toThrow();
		expect(() => slots.importWeekCsv(ctx, { csv: `${HEADER}\n,,,,,,,,` })).toThrow();
		expect(() => slots.importWeekCsv(ctx, { csv: '' })).toThrow();
	});

	test('adds to the week, or replaces it, as asked', () => {
		slots.importWeekCsv(ctx, { csv: `${HEADER}\n900,30,Deep work,,,,,,`, clearExisting: true });
		expect(slots.listWeeklySlots(ctx)).toHaveLength(1);

		slots.importWeekCsv(ctx, { csv: `${HEADER}\n1000,30,Deep work,,,,,,` });
		expect(slots.listWeeklySlots(ctx)).toHaveLength(2);

		slots.importWeekCsv(ctx, { csv: `${HEADER}\n1100,30,Deep work,,,,,,`, clearExisting: true });
		expect(slots.listWeeklySlots(ctx)).toHaveLength(1);
	});

	test('says what is missing when there is nowhere to file an unknown cell', () => {
		// An account with no categories at all: the block cannot be made, and
		// the old code found that out at the check constraint, as a 500.
		expect(() => slots.importWeekCsv(theirs, { csv: `${HEADER}\n900,30,Something,,,,,,` })).toThrow(
			/category/i
		);
	});
});

describe('how a block repeats', () => {
	test('plain weekly is the default and needs nothing', () => {
		const rule = recurrence.parseRecurrence('weekly');
		expect(rule.kind).toBe('weekly');
	});

	test('every N weeks counts from its anchor', () => {
		const rule = recurrence.parseRecurrence('weeks:2:2026-08-17');
		// The anchor week, and the one a fortnight later.
		expect(recurrence.occursOn(rule, new Date('2026-08-17T00:00:00'), 0)).toBe(true);
		expect(recurrence.occursOn(rule, new Date('2026-08-31T00:00:00'), 0)).toBe(true);
		// Not the week between.
		expect(recurrence.occursOn(rule, new Date('2026-08-24T00:00:00'), 0)).toBe(false);
	});

	test('every N days ignores the weekday entirely', () => {
		const rule = recurrence.parseRecurrence('days:3:2026-08-17');
		expect(recurrence.occursOn(rule, new Date('2026-08-20T00:00:00'), 0)).toBe(true);
		expect(recurrence.occursOn(rule, new Date('2026-08-21T00:00:00'), 0)).toBe(false);
	});

	test('nothing happens before the anchor', () => {
		const rule = recurrence.parseRecurrence('days:3:2026-08-17');
		expect(recurrence.occursOn(rule, new Date('2026-08-14T00:00:00'), 0)).toBe(false);
	});

	test('monthly on the 31st lands on the last day of a short month', () => {
		// "The 31st" means the end of the month to whoever picked it; skipping
		// February entirely is not what anybody meant.
		const rule = recurrence.parseRecurrence('monthly:31');
		expect(recurrence.occursOn(rule, new Date('2026-09-30T00:00:00'), 0)).toBe(true);
		expect(recurrence.occursOn(rule, new Date('2026-10-31T00:00:00'), 0)).toBe(true);
	});

	test('a rule out of range comes back as plain weekly rather than being stored', () => {
		const form = new FormData();
		form.set('recurrenceKind', 'weeks');
		form.set('recurrenceInterval', '0');
		expect(slots.readRecurrence(form, ctx.now)).toBe('weekly');

		const nonsense = new FormData();
		nonsense.set('recurrenceKind', 'sometimes');
		expect(slots.readRecurrence(nonsense, ctx.now)).toBe('weekly');
	});

	test('a form with an every-N shape keeps its anchor', () => {
		const form = new FormData();
		form.set('recurrenceKind', 'weeks');
		form.set('recurrenceInterval', '2');
		form.set('recurrenceAnchor', '2026-08-17');
		expect(slots.readRecurrence(form, ctx.now)).toBe('weeks:2:2026-08-17');
	});

	test('and with no anchor it counts from today', () => {
		const form = new FormData();
		form.set('recurrenceKind', 'days');
		form.set('recurrenceInterval', '3');
		expect(slots.readRecurrence(form, ctx.now)).toBe('days:3:2026-08-17');
	});
});

describe('turning a one-off into a repeating block', () => {
	test('takes the weekday from the date it was sitting on', () => {
		const one = slots.createExceptional(ctx, {
			// A Wednesday.
			date: '2026-08-19',
			startTime: '10:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'Standup'
		});

		slots.convertRepeat(ctx, one, { to: 'weekly', date: '2026-08-19' });

		const made = slots.listWeeklySlots(ctx).find((s) => s.label === 'Standup')!;
		expect(made.weekday).toBe(2);
		expect(made.startTime).toBe('10:00');
	});

	test('refuses a target that is neither', () => {
		const one = slots.createExceptional(ctx, {
			date: '2026-08-20',
			startTime: '10:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'Other'
		});
		expect(() => slots.convertRepeat(ctx, one, { to: 'sometimes', date: '2026-08-20' })).toThrow();
	});
});
