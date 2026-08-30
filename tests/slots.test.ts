/**
 * The weekly plan: the blocks, and the exceptions to them.
 *
 * This is the part of the app with the most ways to be subtly wrong, because
 * a weekly block is a *rule* and everything you do to one day of it is an
 * exception to that rule. Skipping Wednesday must not touch next Wednesday;
 * moving one occurrence must leave the block where it is; deleting the block
 * has to take the exceptions with it or they outlive the thing they were
 * exceptions to.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let slots: typeof import('../src/lib/server/services/slots');
let activities: typeof import('../src/lib/server/services/activities');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

beforeAll(async () => {
	slots = await import('../src/lib/server/services/slots');
	activities = await import('../src/lib/server/services/activities');
	// Monday 2026-08-17.
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
});

const block = (over: Record<string, unknown> = {}) => ({
	weekday: 0,
	startTime: '09:00',
	durationMinutes: 60,
	mode: 'category',
	categoryId: work,
	label: 'Deep work',
	...over
});

describe('a weekly block', () => {
	test('is created where it was put', () => {
		const id = slots.createSlot(ctx, block({ weekday: 2, startTime: '14:00' }));
		const made = slots.listWeeklySlots(ctx).find((s) => s.id === id)!;
		expect(made.weekday).toBe(2);
		expect(made.startTime).toBe('14:00');
		expect(made.durationMinutes).toBe(60);
	});

	test('refuses a weekday outside the week and a time that is not one', () => {
		expect(() => slots.createSlot(ctx, block({ weekday: 7 }))).toThrow();
		expect(() => slots.createSlot(ctx, block({ weekday: -1 }))).toThrow();
		expect(() => slots.createSlot(ctx, block({ startTime: '25:00' }))).toThrow();
		expect(() => slots.createSlot(ctx, block({ startTime: 'lunchtime' }))).toThrow();
	});

	test('can be turned off without being deleted', () => {
		const id = slots.createSlot(ctx, block({ weekday: 3 }));
		slots.toggleSlotActive(ctx, id);

		expect(slots.listActiveWeeklySlots(ctx).some((s) => s.id === id)).toBe(false);
		// Still there, still yours — an off block is put away, not destroyed.
		expect(slots.listWeeklySlots(ctx).some((s) => s.id === id)).toBe(true);

		slots.toggleSlotActive(ctx, id);
		expect(slots.listActiveWeeklySlots(ctx).some((s) => s.id === id)).toBe(true);
	});

	test('is moved and resized by an update', () => {
		const id = slots.createSlot(ctx, block({ weekday: 4 }));
		slots.updateSlot(ctx, id, block({ weekday: 5, startTime: '11:30', durationMinutes: 90 }));

		const moved = slots.listWeeklySlots(ctx).find((s) => s.id === id)!;
		expect(moved.weekday).toBe(5);
		expect(moved.startTime).toBe('11:30');
		expect(moved.durationMinutes).toBe(90);
	});

	test('belongs to one account', () => {
		const mine = slots.listWeeklySlots(ctx)[0];
		expect(() => slots.updateSlot(theirs, mine.id, block())).toThrow();
		expect(slots.listWeeklySlots(theirs)).toHaveLength(0);
	});
});

describe('copying a block to other days', () => {
	test('puts it on each day it is not already on', () => {
		const id = slots.createSlot(ctx, block({ weekday: 0, startTime: '07:00', label: 'Gym' }));
		slots.copySlotsToWeekdays(ctx, [id], [0, 1, 2]);

		const gym = slots.listWeeklySlots(ctx).filter((s) => s.label === 'Gym');
		// Monday was already there and is not duplicated.
		expect(gym.map((s) => s.weekday).sort()).toEqual([0, 1, 2]);
	});

	test('refuses an empty selection at either end', () => {
		const id = slots.listWeeklySlots(ctx)[0].id;
		expect(() => slots.copySlotsToWeekdays(ctx, [], [1])).toThrow();
		expect(() => slots.copySlotsToWeekdays(ctx, [id], [])).toThrow();
	});

	test("will not copy another account's block", () => {
		const mine = slots.listWeeklySlots(ctx)[0];
		expect(() => slots.copySlotsToWeekdays(theirs, [mine.id], [3])).toThrow();
	});
});

describe('skipping one day of a repeating block', () => {
	test('touches that day and no other', () => {
		const id = slots.createSlot(ctx, block({ weekday: 0, startTime: '16:00', label: 'Russian' }));

		slots.suppressOccurrence(ctx, id, '2026-08-17');

		const skipped = slots.listSuppressions(ctx, '2026-08-01', '2026-09-01');
		expect(skipped.filter((s) => s.slotId === id)).toHaveLength(1);
		// The rule itself is untouched: next Monday still has it.
		expect(slots.listActiveWeeklySlots(ctx).some((s) => s.id === id)).toBe(true);
	});

	test('is undone by putting it back', () => {
		const russian = slots.listWeeklySlots(ctx).find((s) => s.label === 'Russian')!;
		slots.unsuppressOccurrence(ctx, russian.id, '2026-08-17');
		expect(
			slots.listSuppressions(ctx, '2026-08-01', '2026-09-01').filter((s) => s.slotId === russian.id)
		).toHaveLength(0);
	});

	test('refuses a date that is not one', () => {
		const russian = slots.listWeeklySlots(ctx).find((s) => s.label === 'Russian')!;
		expect(() => slots.suppressOccurrence(ctx, russian.id, 'next tuesday')).toThrow();
	});

	test('and the skip goes when the block does', () => {
		const russian = slots.listWeeklySlots(ctx).find((s) => s.label === 'Russian')!;
		slots.suppressOccurrence(ctx, russian.id, '2026-08-24');
		slots.deleteSlots(ctx, [russian.id]);

		// An exception that outlives its rule is a row nothing can ever explain.
		expect(
			slots.listSuppressions(ctx, '2026-08-01', '2026-09-01').some((s) => s.slotId === russian.id)
		).toBe(false);
	});
});

describe('a one-off block', () => {
	test('exists on its date and nowhere else', () => {
		const id = slots.createExceptional(ctx, {
			date: '2026-08-19',
			startTime: '10:00',
			durationMinutes: 45,
			mode: 'category',
			categoryId: work,
			label: 'Dentist'
		});

		expect(slots.listExceptionals(ctx, '2026-08-19', '2026-08-20').some((e) => e.id === id)).toBe(
			true
		);
		expect(slots.listExceptionals(ctx, '2026-08-20', '2026-08-21')).toHaveLength(0);
	});

	test('is edited and deleted like anything else', () => {
		const one = slots.listExceptionals(ctx, '2026-08-19', '2026-08-20')[0];
		slots.updateExceptional(ctx, one.id, {
			date: '2026-08-20',
			startTime: '11:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'Dentist, moved'
		});
		expect(slots.listExceptionals(ctx, '2026-08-20', '2026-08-21')).toHaveLength(1);

		slots.deleteExceptional(ctx, one.id);
		expect(slots.listExceptionals(ctx, '2026-08-20', '2026-08-21')).toHaveLength(0);
	});

	test("is not another account's to touch", () => {
		const id = slots.createExceptional(ctx, {
			date: '2026-08-21',
			startTime: '09:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: work,
			label: 'Mine'
		});
		expect(() => slots.deleteExceptional(theirs, id)).toThrow();
	});
});

describe('moving one occurrence of a repeating block', () => {
	test('skips it where it was and makes a one-off where it went', () => {
		const id = slots.createSlot(ctx, block({ weekday: 0, startTime: '13:00', label: 'Piano' }));

		slots.moveOccurrence(ctx, {
			slotId: id,
			fromDate: '2026-08-17',
			date: '2026-08-18',
			startTime: '15:00',
			durationMinutes: 60
		});

		// The rule is untouched…
		const rule = slots.listWeeklySlots(ctx).find((s) => s.id === id)!;
		expect(rule.weekday).toBe(0);
		expect(rule.startTime).toBe('13:00');

		// …that Monday is skipped…
		expect(
			slots.listSuppressions(ctx, '2026-08-17', '2026-08-18').some((s) => s.slotId === id)
		).toBe(true);

		// …and Tuesday has a one-off standing in for it.
		expect(
			slots.listExceptionals(ctx, '2026-08-18', '2026-08-19').some((e) => e.label === 'Piano')
		).toBe(true);
	});

	test('refuses to move a block that is not yours', () => {
		const mine = slots.listWeeklySlots(ctx)[0];
		expect(() =>
			slots.moveOccurrence(theirs, {
				slotId: mine.id,
				fromDate: '2026-08-17',
				date: '2026-08-18',
				startTime: '09:00'
			})
		).toThrow();
	});
});
