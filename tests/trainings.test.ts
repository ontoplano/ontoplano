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
