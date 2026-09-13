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

let workouts: typeof import('../src/lib/services/workouts');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
/** A kind of this account's own, since the fixed five are rows now. */
let strength: number;

beforeAll(async () => {
	workouts = await import('../src/lib/services/workouts');
	ctx = { userId: OWNER, now: new Date('2026-09-06T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	strength = workouts.listWorkoutCategories(ctx).find((c) => c.name === 'Strength')!.id;
});

describe('a workout', () => {
	test('is created with a kind of the account\u2019s own, and an optional length', () => {
		const id = workouts.createWorkout(ctx, {
			title: 'Push day',
			categoryId: strength,
			minutes: 50
		});
		const t = workouts.getWorkout(ctx, id);
		expect(t.title).toBe('Push day');
		expect(t.categoryName).toBe('Strength');
		expect(t.minutes).toBe(50);
		expect(t.archived).toBe(false);
	});

	test('and has no kind when none is given', () => {
		const id = workouts.createWorkout(ctx, { title: 'A walk' });
		expect(workouts.getWorkout(ctx, id).categoryId).toBeNull();
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
	let instances: typeof import('../src/lib/services/instances');
	let slots: typeof import('../src/lib/services/slots');

	beforeAll(async () => {
		instances = await import('../src/lib/services/instances');
		slots = await import('../src/lib/services/slots');
	});

	test('becomes a block that IS the workout', () => {
		const id = workouts.createWorkout(ctx, { title: 'Leg day', categoryId: strength, minutes: 45 });
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
		const id = workouts.createWorkout(ctx, { title: 'Row', categoryId: strength });
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
		const id = workouts.createWorkout(now, { title: 'Mobility today', categoryId: strength });
		const blockId = workouts.scheduleWorkout(now, id, { date: today, startTime: '08:00' });

		workouts.doneToday(now, id);

		const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
		const block = slots.listExceptionals(now, today, tomorrow).find((b) => b.id === blockId)!;
		expect(block.status).toBe('done');
	});

	test('a block for somebody else’s workout is refused', () => {
		const id = workouts.createWorkout(ctx, { title: 'Private session', categoryId: strength });
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
	let slots: typeof import('../src/lib/services/slots');

	beforeAll(async () => {
		slots = await import('../src/lib/services/slots');
	});

	test('is created from a workout, with no category to file it under', () => {
		const id = workouts.createWorkout(ctx, { title: 'Monday legs', categoryId: strength });
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
	let slots: typeof import('../src/lib/services/slots');
	let grid: typeof import('../src/lib/planner-grid');

	beforeAll(async () => {
		slots = await import('../src/lib/services/slots');
		grid = await import('../src/lib/planner-grid');
	});

	test('on the week, with no label of its own', () => {
		const id = workouts.createWorkout(ctx, { title: 'Push day', categoryId: strength });
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
		const id = workouts.createWorkout(ctx, { title: 'Pull day', categoryId: strength });
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
		const id = workouts.createWorkout(ctx, { title: 'Leg day', categoryId: strength });
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

/**
 * The register: what was actually done, and how much of it.
 *
 * "Last done" answers whether somebody is keeping a workout up and cannot
 * answer whether they are getting anywhere with it. These rows are the second
 * question, and the rules that matter are that the numbers survive a
 * round trip in the person's own units, that the stamp on the workout agrees
 * with them whichever way the sessions move, and that none of it is reachable
 * from another account.
 */
describe('writing down a session', () => {
	test('keeps the words and the numbers exactly as they were given', () => {
		const id = workouts.createWorkout(ctx, { title: 'Pull day', categoryId: strength });
		const session = workouts.logWorkout(ctx, id, {
			doneOn: '2026-09-10',
			notes: 'felt heavy',
			measures: [
				{ activity: 'deadlifted for 5 reps', amount: 120, unit: 'kg' },
				{ activity: 'ran', amount: 5.5, unit: 'km' },
				// No number attached: doing the routine is a thing that happened.
				{ activity: 'did the mobility routine' }
			]
		});

		const found = workouts.getSession(ctx, session);
		expect(found.doneOn).toBe('2026-09-10');
		expect(found.notes).toBe('felt heavy');
		expect(found.measures.map((m) => [m.activity, m.amount, m.unit])).toEqual([
			['deadlifted for 5 reps', 120, 'kg'],
			['ran', 5.5, 'km'],
			['did the mobility routine', null, '']
		]);
	});

	test('drops a line somebody opened and did not fill in', () => {
		const id = workouts.createWorkout(ctx, { title: 'Abandoned row', categoryId: strength });
		const session = workouts.logWorkout(ctx, id, {
			measures: [{ activity: 'swam', amount: 1, unit: 'km' }, { activity: '   ' }, { activity: '' }]
		});
		expect(workouts.getSession(ctx, session).measures).toHaveLength(1);
	});

	test('moves the workout’s last-done stamp, and moves it back', () => {
		const id = workouts.createWorkout(ctx, { title: 'Stamped', categoryId: strength });
		const older = workouts.logWorkout(ctx, id, { doneOn: '2026-08-01' });
		const newer = workouts.logWorkout(ctx, id, { doneOn: '2026-09-01' });

		const stamped = () => workouts.getWorkout(ctx, id).lastDoneAt;
		expect(stamped()).toBe('2026-09-01');

		// Removing the newest moves it back to the one that is still there,
		// rather than leaving it pointing at something that no longer exists.
		workouts.deleteSession(ctx, newer);
		expect(stamped()).toBe('2026-08-01');

		workouts.deleteSession(ctx, older);
		expect(stamped()).toBeNull();
	});

	test('the quick tick writes one session a day, however often it is pressed', () => {
		const id = workouts.createWorkout(ctx, { title: 'Ticked', categoryId: strength });
		workouts.done(ctx, id);
		workouts.done(ctx, id);
		expect(workouts.listSessions(ctx, { workoutId: id })).toHaveLength(1);
	});

	test('correcting one replaces every line', () => {
		const id = workouts.createWorkout(ctx, { title: 'Corrected', categoryId: strength });
		const session = workouts.logWorkout(ctx, id, {
			doneOn: '2026-09-02',
			measures: [{ activity: 'ran', amount: 3, unit: 'km' }]
		});

		workouts.updateSession(ctx, session, {
			doneOn: '2026-09-03',
			notes: 'it was the third',
			measures: [{ activity: 'ran', amount: 4, unit: 'km' }]
		});

		const found = workouts.getSession(ctx, session);
		expect(found.doneOn).toBe('2026-09-03');
		expect(found.measures).toHaveLength(1);
		expect(found.measures[0].amount).toBe(4);
		expect(workouts.getWorkout(ctx, id).lastDoneAt).toBe('2026-09-03');
	});

	test('a workout with history is archived, not deleted', () => {
		const id = workouts.createWorkout(ctx, { title: 'Has history', categoryId: strength });
		workouts.logWorkout(ctx, id, { doneOn: '2026-09-05' });
		expect(() => workouts.deleteWorkout(ctx, id)).toThrow(/Archive it instead/);

		// One made by mistake still goes.
		const fresh = workouts.createWorkout(ctx, { title: 'Never done', categoryId: strength });
		expect(() => workouts.deleteWorkout(ctx, fresh)).not.toThrow();
	});

	test('is nobody else’s to read, write or remove', () => {
		const id = workouts.createWorkout(ctx, { title: 'Private session', categoryId: strength });
		const session = workouts.logWorkout(ctx, id, {
			measures: [{ activity: 'ran', amount: 1, unit: 'km' }]
		});

		expect(() => workouts.logWorkout(theirs, id, {})).toThrow();
		expect(() => workouts.getSession(theirs, session)).toThrow();
		expect(() => workouts.deleteSession(theirs, session)).toThrow();
		expect(workouts.listSessions(theirs, { workoutId: id })).toEqual([]);
	});
});

describe('one activity over time', () => {
	test('is grouped by the word, not by the workout it happened in', () => {
		const morning = workouts.createWorkout(ctx, { title: 'Morning run', categoryId: strength });
		const sunday = workouts.createWorkout(ctx, { title: 'Sunday long one', categoryId: strength });
		workouts.logWorkout(ctx, morning, {
			doneOn: '2026-09-07',
			measures: [{ activity: 'jogged', amount: 5, unit: 'km' }]
		});
		workouts.logWorkout(ctx, sunday, {
			doneOn: '2026-09-08',
			measures: [{ activity: 'jogged', amount: 12, unit: 'km' }]
		});

		// Oldest first, which is the direction a chart's x-axis runs.
		const points = workouts.measureHistory(ctx, 'jogged');
		expect(points.map((p) => [p.doneOn, p.amount])).toEqual([
			['2026-09-07', 5],
			['2026-09-08', 12]
		]);

		expect(workouts.measureHistory(ctx, 'jogged', { since: '2026-09-08' })).toHaveLength(1);
		expect(workouts.measuredActivities(ctx).find((a) => a.activity === 'jogged')?.times).toBe(2);
		expect(workouts.measureHistory(theirs, 'jogged')).toEqual([]);
	});
});

/**
 * What a workout declares it measures.
 *
 * Names without numbers, on the workout rather than on any one session of it:
 * they decide what writing a session down asks for. A suggestion, not a rule —
 * a session may still measure anything.
 */
describe('what a workout measures', () => {
	test('keeps the names, the units and the order they were given in', () => {
		const id = workouts.createWorkout(ctx, {
			title: 'Long run',
			categoryId: strength,
			measures: [
				{ activity: 'ran', unit: 'km' },
				{ activity: 'pace', unit: 'min/km' }
			]
		});

		expect(workouts.getWorkout(ctx, id).measures).toEqual([
			{ activity: 'ran', unit: 'km' },
			{ activity: 'pace', unit: 'min/km' }
		]);

		// Replaced wholesale, and the new order is the order it keeps.
		workouts.setWorkoutMeasures(ctx, id, [
			{ activity: 'pace', unit: 'min/km' },
			{ activity: 'ran', unit: 'km' },
			// Opened and abandoned: dropped rather than refused.
			{ activity: '  ' }
		]);
		expect(workouts.getWorkout(ctx, id).measures.map((m) => m.activity)).toEqual(['pace', 'ran']);
	});

	test('is left alone by an edit that says nothing about it', () => {
		const id = workouts.createWorkout(ctx, {
			title: 'Left alone',
			categoryId: strength,
			measures: [{ activity: 'swam', unit: 'm' }]
		});
		workouts.updateWorkout(ctx, id, { title: 'Left alone, renamed', categoryId: strength });
		expect(workouts.getWorkout(ctx, id).measures).toHaveLength(1);
	});

	test('declares nothing about what a session may record', () => {
		const id = workouts.createWorkout(ctx, {
			title: 'Suggestion only',
			categoryId: strength,
			measures: [{ activity: 'ran', unit: 'km' }]
		});
		// Something the workout never named, written down anyway.
		const session = workouts.logWorkout(ctx, id, {
			measures: [{ activity: 'skipped rope', amount: 200, unit: 'turns' }]
		});
		expect(workouts.getSession(ctx, session).measures[0].activity).toBe('skipped rope');
	});

	test("is nobody else's to declare", () => {
		const id = workouts.createWorkout(ctx, { title: 'Private measures', categoryId: strength });
		expect(() =>
			workouts.setWorkoutMeasures(theirs, id, [{ activity: 'ran', unit: 'km' }])
		).toThrow();
		expect(workouts.getWorkout(ctx, id).measures).toEqual([]);
	});

	test('goes with the workout when it is deleted', () => {
		const id = workouts.createWorkout(ctx, {
			title: 'Gone with it',
			categoryId: strength,
			measures: [{ activity: 'ran', unit: 'km' }]
		});
		workouts.deleteWorkout(ctx, id);
		expect(() => workouts.getWorkout(ctx, id)).toThrow();
	});
});
