/**
 * A goal counted from the workout register.
 *
 * "Run 100 km this quarter" is a number the register already holds: every
 * session that recorded `ran` has an amount against it, and adding those up
 * inside the goal's period is the answer. Typing the same total into a goal by
 * hand is asking somebody to keep two copies of one fact, and the copies drift
 * the first week somebody forgets.
 *
 * The rule that matters most is that the two can never disagree: a counted
 * measure is read, and the tool for typing a number into one refuses it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let goals: typeof import('../src/lib/services/goals');
let workouts: typeof import('../src/lib/services/workouts');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let plan: number;

/** The quarter this test lives in, so the fixtures land inside the period. */
const NOW = new Date('2026-08-17T09:00:00');
const QUARTER_START = '2026-07-01';

beforeAll(async () => {
	goals = await import('../src/lib/services/goals');
	workouts = await import('../src/lib/services/workouts');
	ctx = { userId: OWNER, now: NOW, tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	plan = workouts.createWorkout(ctx, { title: 'Running' });
});

const target = (goalId: number) => goals.listGoals(ctx).find((g) => g.id === goalId)!.targets[0];

function ran(km: number, doneOn: string, of = ctx, workoutId = plan) {
	workouts.logWorkout(of, workoutId, {
		doneOn,
		measures: [{ activity: 'ran', amount: km, unit: 'km' }]
	});
}

function runningGoal() {
	return goals.createGoal(ctx, {
		title: 'run 100km this quarter',
		horizon: 'quarter',
		startDate: QUARTER_START,
		targets: [{ value: 100, unit: 'km', whole: false, measureActivity: 'ran' }]
	});
}

describe('a target that counts a workout measure', () => {
	test('starts at what the register already holds', () => {
		ran(5, '2026-07-10');
		ran(7.5, '2026-07-20');
		const id = runningGoal();

		const t = target(id);
		expect(t.measureActivity).toBe('ran');
		expect(t.currentValue).toBe(12.5);
		expect(t.fraction).toBeCloseTo(0.125);
	});

	test('moves by itself when another session is logged', () => {
		const id = runningGoal();
		const before = target(id).currentValue;
		ran(10, '2026-08-01');
		expect(target(id).currentValue).toBe(before + 10);
	});

	test('counts only what falls inside the goal’s own period', () => {
		ran(42, '2026-06-30'); // the quarter before
		ran(13, '2026-10-01'); // the quarter after
		const id = runningGoal();
		const inside = target(id).currentValue;

		expect(inside).toBeGreaterThan(0);
		expect(inside).toBeLessThan(42);
	});

	test('ignores a line with no number against it', () => {
		const id = runningGoal();
		const before = target(id).currentValue;
		workouts.logWorkout(ctx, plan, {
			doneOn: '2026-08-02',
			measures: [{ activity: 'ran' }]
		});
		expect(target(id).currentValue).toBe(before);
	});

	test('counts nothing for a word nobody has logged', () => {
		const id = goals.createGoal(ctx, {
			title: 'swim 20km',
			horizon: 'quarter',
			startDate: QUARTER_START,
			targets: [{ value: 20, unit: 'km', whole: false, measureActivity: 'swam' }]
		});
		expect(target(id).currentValue).toBe(0);
	});
});

describe('the two numbers can never disagree', () => {
	test('typing into a counted measure is refused', () => {
		const id = runningGoal();
		const t = target(id);
		expect(() => goals.setTargetProgress(ctx, t.id, 99)).toThrow(/workouts/i);
		expect(target(id).currentValue).not.toBe(99);
	});

	test('a measure kept by hand still takes a number', () => {
		const id = goals.createGoal(ctx, {
			title: 'read twelve books',
			horizon: 'year',
			startDate: '2026-01-01',
			targets: [{ value: 12, unit: 'books' }]
		});
		const t = target(id);
		expect(t.measureActivity).toBeNull();
		goals.setTargetProgress(ctx, t.id, 7);
		expect(target(id).currentValue).toBe(7);
	});
});

describe('editing one', () => {
	test('the measure it counts can be changed, and taken off again', () => {
		const id = runningGoal();
		goals.updateGoal(ctx, id, {
			title: 'run 100km this quarter',
			targets: [{ id: target(id).id, value: 100, unit: 'km', whole: false }]
		});
		expect(target(id).measureActivity).toBeNull();
		// And with it gone, the number is whatever was typed — which is nothing.
		expect(target(id).currentValue).toBe(0);
	});

	test('added afterwards rather than at birth', () => {
		const id = goals.createGoal(ctx, {
			title: 'move more',
			horizon: 'quarter',
			startDate: QUARTER_START
		});
		goals.addGoalTarget(ctx, id, { value: 50, unit: 'km', measureActivity: 'ran' });
		expect(target(id).measureActivity).toBe('ran');
		expect(target(id).currentValue).toBeGreaterThan(0);
	});
});

describe('a stranger', () => {
	test('does not have their sessions counted towards somebody else’s goal', () => {
		const id = runningGoal();
		const before = target(id).currentValue;
		ran(1000, '2026-08-05', theirs, workouts.createWorkout(theirs, { title: 'Running' }));
		expect(target(id).currentValue).toBe(before);
	});
});
