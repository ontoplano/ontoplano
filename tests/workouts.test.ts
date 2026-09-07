/**
 * Workouts: workouts under Health, planned like meals.
 *
 * The rules that matter: a workout is created and edited within its own
 * account and nobody else's; archiving keeps it out of the working list while
 * its history survives; and "done" stamps the last session the way "cooked"
 * does for a recipe. The scheduling itself is the block's `workoutId`, tested
 * where blocks are tested — here we hold the workouts service to its own.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let workouts: typeof import('../src/lib/server/services/workouts');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	workouts = await import('../src/lib/server/services/workouts');
	ctx = { userId: OWNER, now: new Date('2026-09-06T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('a workout', () => {
	test('is created with a kind and an optional length', () => {
		const id = workouts.createWorkout(ctx, {
			title: 'Push day',
			kind: 'strength',
			minutes: 50
		});
		const t = workouts.getWorkout(ctx, id);
		expect(t.title).toBe('Push day');
		expect(t.kind).toBe('strength');
		expect(t.minutes).toBe(50);
		expect(t.archived).toBe(false);
	});

	test('defaults to the "other" kind when none is given', () => {
		const id = workouts.createWorkout(ctx, { title: 'A walk' });
		expect(workouts.getWorkout(ctx, id).kind).toBe('other');
	});

	test('a length of zero or less is refused', () => {
		expect(() => workouts.createWorkout(ctx, { title: 'Bad', minutes: 0 })).toThrow();
	});

	test('archiving keeps it out of the list but not the full one', () => {
		const id = workouts.createWorkout(ctx, { title: 'Old routine' });
		workouts.setArchived(ctx, id, true);
		expect(workouts.listWorkouts(ctx).some((t) => t.id === id)).toBe(false);
		expect(workouts.listWorkouts(ctx, { includeArchived: true }).some((t) => t.id === id)).toBe(
			true
		);
		workouts.setArchived(ctx, id, false);
		expect(workouts.listWorkouts(ctx).some((t) => t.id === id)).toBe(true);
	});

	test('"done" stamps the last session', () => {
		const id = workouts.createWorkout(ctx, { title: 'Run' });
		expect(workouts.getWorkout(ctx, id).lastDoneAt).toBeNull();
		workouts.done(ctx, id);
		expect(workouts.getWorkout(ctx, id).lastDoneAt).not.toBeNull();
	});
});

/**
 * A workout on the week and the workout in Health are one thing.
 *
 * The block points at the workout rather than copying it, so the two cannot
 * drift — and ticking either has to move both, or somebody finishes the
 * session on Monday's plan and Health still says it was never done.
 */
describe('a workout put on a day', () => {
	let instances: typeof import('../src/lib/server/services/instances');
	let slots: typeof import('../src/lib/server/services/slots');

	beforeAll(async () => {
		instances = await import('../src/lib/server/services/instances');
		slots = await import('../src/lib/server/services/slots');
	});

	test('becomes a block that IS the workout', () => {
		const id = workouts.createWorkout(ctx, { title: 'Leg day', kind: 'strength', minutes: 45 });
		const blockId = workouts.scheduleWorkout(ctx, id, {
			date: '2026-09-08',
			startTime: '07:00'
		});

		// The range is half-open, so the end is the day after.
		const block = slots
			.listExceptionals(ctx, '2026-09-08', '2026-09-09')
			.find((b) => b.id === blockId)!;
		expect(block.mode).toBe('workout');
		expect(block.workoutId).toBe(id);
		expect(block.label).toBe('Leg day');
		// Its usual length is the block's default rather than a bare hour.
		expect(block.durationMinutes).toBe(45);
	});

	test('finishing the block finishes the workout', () => {
		const id = workouts.createWorkout(ctx, { title: 'Row', kind: 'cardio' });
		const blockId = workouts.scheduleWorkout(ctx, id, {
			date: '2026-09-09',
			startTime: '07:00'
		});
		expect(workouts.getWorkout(ctx, id).lastDoneAt).toBeNull();

		instances.setStatusOn(ctx, 'exceptional', blockId, '2026-09-09', 'done');

		expect(workouts.getWorkout(ctx, id).lastDoneAt).not.toBeNull();
	});

	test('and finishing the workout finishes today’s block', () => {
		const today = new Date().toISOString().slice(0, 10);
		const now = { ...ctx, now: new Date() };
		const id = workouts.createWorkout(now, { title: 'Mobility today', kind: 'mobility' });
		const blockId = workouts.scheduleWorkout(now, id, { date: today, startTime: '08:00' });

		workouts.doneToday(now, id);

		const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
		const block = slots.listExceptionals(now, today, tomorrow).find((b) => b.id === blockId)!;
		expect(block.status).toBe('done');
	});

	test('a block for somebody else’s workout is refused', () => {
		const id = workouts.createWorkout(ctx, { title: 'Private session', kind: 'other' });
		expect(() =>
			slots.createExceptional(theirs, {
				date: '2026-09-10',
				startTime: '07:00',
				durationMinutes: 60,
				mode: 'workout',
				workoutId: id
			})
		).toThrow();
	});
});

describe('one account cannot reach another’s', () => {
	test('a stranger cannot read, edit, archive, or delete a workout', () => {
		const id = workouts.createWorkout(ctx, { title: 'Private session' });
		expect(() => workouts.getWorkout(theirs, id)).toThrow();
		expect(() => workouts.updateWorkout(theirs, id, { title: 'x' })).toThrow();
		expect(() => workouts.setArchived(theirs, id, true)).toThrow();
		expect(() => workouts.deleteWorkout(theirs, id)).toThrow();
		expect(workouts.listWorkouts(theirs).some((t) => t.id === id)).toBe(false);
	});
});

/**
 * The bug this file exists to stop coming back.
 *
 * The weekly-block form posted a workout and the server refused it with
 * "Workout required" — the action's field list, written before workouts
 * existed, never carried `workoutId` to the parser. The one-off path worked,
 * so the failure looked like the form rather than the plumbing.
 */
describe('a weekly block that is a workout', () => {
	let slots: typeof import('../src/lib/server/services/slots');

	beforeAll(async () => {
		slots = await import('../src/lib/server/services/slots');
	});

	test('is created from a workout, with no category to file it under', () => {
		const id = workouts.createWorkout(ctx, { title: 'Monday legs', kind: 'strength' });
		const slotId = slots.createSlot(ctx, {
			weekday: 0,
			startTime: '16:00',
			durationMinutes: 90,
			mode: 'workout',
			workoutId: id
		});

		const slot = slots.listWeeklySlots(ctx).find((s) => s.id === slotId)!;
		expect(slot.mode).toBe('workout');
		expect(slot.workoutId).toBe(id);
		// No category: being a workout is what it is filed under.
		expect(slot.categoryId).toBeNull();
	});

	test('and a workout-mode block with no workout is refused', () => {
		expect(() =>
			slots.createSlot(ctx, {
				weekday: 0,
				startTime: '16:00',
				durationMinutes: 60,
				mode: 'workout'
			})
		).toThrow(/[Ww]orkout/);
	});
});

/**
 * The second half of the same bug.
 *
 * With `workoutId` finally reaching the server, a workout dropped on the week
 * from the plan drew itself as a grey box labelled "Untitled": the block is
 * named by what it is, and nothing joined the workout's title in. Planning it
 * from the workout itself hid this, because that path writes a label as well.
 */
describe('a workout block is named after its workout', () => {
	let slots: typeof import('../src/lib/server/services/slots');
	let grid: typeof import('../src/lib/planner-grid');

	beforeAll(async () => {
		slots = await import('../src/lib/server/services/slots');
		grid = await import('../src/lib/planner-grid');
	});

	test('on the week, with no label of its own', () => {
		const id = workouts.createWorkout(ctx, { title: 'Push day', kind: 'strength' });
		const slotId = slots.createSlot(ctx, {
			weekday: 2,
			startTime: '07:00',
			durationMinutes: 45,
			mode: 'workout',
			workoutId: id
		});

		const slot = slots.listWeeklySlots(ctx).find((s) => s.id === slotId)!;
		expect(slot.workoutName).toBe('Push day');
		expect(grid.blockName(slot)).toBe('Push day');
	});

	test('and on a single day', () => {
		const id = workouts.createWorkout(ctx, { title: 'Pull day', kind: 'strength' });
		slots.createExceptional(ctx, {
			date: '2026-03-04',
			startTime: '07:00',
			durationMinutes: 45,
			mode: 'workout',
			workoutId: id
		});

		const block = slots
			.listExceptionals(ctx, '2026-03-01', '2026-03-08')
			.find((b) => b.workoutId === id)!;
		expect(block.workoutName).toBe('Pull day');
		expect(grid.blockName(block)).toBe('Pull day');
	});

	test('and renaming the workout renames the block, because nothing was copied', () => {
		const id = workouts.createWorkout(ctx, { title: 'Leg day', kind: 'strength' });
		const slotId = slots.createSlot(ctx, {
			weekday: 4,
			startTime: '18:00',
			durationMinutes: 60,
			mode: 'workout',
			workoutId: id
		});
		workouts.updateWorkout(ctx, id, { title: 'Leg day (heavy)' });

		const slot = slots.listWeeklySlots(ctx).find((s) => s.id === slotId)!;
		expect(grid.blockName(slot)).toBe('Leg day (heavy)');
	});
});
