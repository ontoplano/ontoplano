/**
 * Trainings: workouts under Health, planned like meals.
 *
 * The rules that matter: a training is created and edited within its own
 * account and nobody else's; archiving keeps it out of the working list while
 * its history survives; and "done" stamps the last session the way "cooked"
 * does for a recipe. The scheduling itself is the block's `trainingId`, tested
 * where blocks are tested — here we hold the trainings service to its own.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let trainings: typeof import('../src/lib/server/services/trainings');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	trainings = await import('../src/lib/server/services/trainings');
	ctx = { userId: OWNER, now: new Date('2026-09-06T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('a training', () => {
	test('is created with a kind and an optional length', () => {
		const id = trainings.createTraining(ctx, {
			title: 'Push day',
			kind: 'strength',
			minutes: 50
		});
		const t = trainings.getTraining(ctx, id);
		expect(t.title).toBe('Push day');
		expect(t.kind).toBe('strength');
		expect(t.minutes).toBe(50);
		expect(t.archived).toBe(false);
	});

	test('defaults to the "other" kind when none is given', () => {
		const id = trainings.createTraining(ctx, { title: 'A walk' });
		expect(trainings.getTraining(ctx, id).kind).toBe('other');
	});

	test('a length of zero or less is refused', () => {
		expect(() => trainings.createTraining(ctx, { title: 'Bad', minutes: 0 })).toThrow();
	});

	test('archiving keeps it out of the list but not the full one', () => {
		const id = trainings.createTraining(ctx, { title: 'Old routine' });
		trainings.setArchived(ctx, id, true);
		expect(trainings.listTrainings(ctx).some((t) => t.id === id)).toBe(false);
		expect(trainings.listTrainings(ctx, { includeArchived: true }).some((t) => t.id === id)).toBe(
			true
		);
		trainings.setArchived(ctx, id, false);
		expect(trainings.listTrainings(ctx).some((t) => t.id === id)).toBe(true);
	});

	test('"done" stamps the last session', () => {
		const id = trainings.createTraining(ctx, { title: 'Run' });
		expect(trainings.getTraining(ctx, id).lastDoneAt).toBeNull();
		trainings.done(ctx, id);
		expect(trainings.getTraining(ctx, id).lastDoneAt).not.toBeNull();
	});
});

/**
 * A workout on the week and the workout in Health are one thing.
 *
 * The block points at the training rather than copying it, so the two cannot
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
		const id = trainings.createTraining(ctx, { title: 'Leg day', kind: 'strength', minutes: 45 });
		const blockId = trainings.scheduleTraining(ctx, id, {
			date: '2026-09-08',
			startTime: '07:00'
		});

		// The range is half-open, so the end is the day after.
		const block = slots
			.listExceptionals(ctx, '2026-09-08', '2026-09-09')
			.find((b) => b.id === blockId)!;
		expect(block.mode).toBe('training');
		expect(block.trainingId).toBe(id);
		expect(block.label).toBe('Leg day');
		// Its usual length is the block's default rather than a bare hour.
		expect(block.durationMinutes).toBe(45);
	});

	test('finishing the block finishes the workout', () => {
		const id = trainings.createTraining(ctx, { title: 'Row', kind: 'cardio' });
		const blockId = trainings.scheduleTraining(ctx, id, {
			date: '2026-09-09',
			startTime: '07:00'
		});
		expect(trainings.getTraining(ctx, id).lastDoneAt).toBeNull();

		instances.setStatusOn(ctx, 'exceptional', blockId, '2026-09-09', 'done');

		expect(trainings.getTraining(ctx, id).lastDoneAt).not.toBeNull();
	});

	test('and finishing the workout finishes today’s block', () => {
		const today = new Date().toISOString().slice(0, 10);
		const now = { ...ctx, now: new Date() };
		const id = trainings.createTraining(now, { title: 'Mobility today', kind: 'mobility' });
		const blockId = trainings.scheduleTraining(now, id, { date: today, startTime: '08:00' });

		trainings.doneToday(now, id);

		const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
		const block = slots.listExceptionals(now, today, tomorrow).find((b) => b.id === blockId)!;
		expect(block.status).toBe('done');
	});

	test('a block for somebody else’s workout is refused', () => {
		const id = trainings.createTraining(ctx, { title: 'Private session', kind: 'other' });
		expect(() =>
			slots.createExceptional(theirs, {
				date: '2026-09-10',
				startTime: '07:00',
				durationMinutes: 60,
				mode: 'training',
				trainingId: id
			})
		).toThrow();
	});
});

describe('one account cannot reach another’s', () => {
	test('a stranger cannot read, edit, archive, or delete a training', () => {
		const id = trainings.createTraining(ctx, { title: 'Private session' });
		expect(() => trainings.getTraining(theirs, id)).toThrow();
		expect(() => trainings.updateTraining(theirs, id, { title: 'x' })).toThrow();
		expect(() => trainings.setArchived(theirs, id, true)).toThrow();
		expect(() => trainings.deleteTraining(theirs, id)).toThrow();
		expect(trainings.listTrainings(theirs).some((t) => t.id === id)).toBe(false);
	});
});
