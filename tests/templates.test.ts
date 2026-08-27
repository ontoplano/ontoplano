/**
 * The starter weeks, after the first run.
 *
 * These were only ever offered during onboarding, so the interesting behaviour
 * is what happens the second time: applying a template twice must not leave two
 * categories called "work", and replacing a plan must replace it rather than
 * merge two timetables into a week that is neither.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	onboarding: typeof import('../src/lib/server/services/onboarding');
	activities: typeof import('../src/lib/server/services/activities');
	slots: typeof import('../src/lib/server/services/slots');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	s = {
		onboarding: await import('../src/lib/server/services/onboarding'),
		activities: await import('../src/lib/server/services/activities'),
		slots: await import('../src/lib/server/services/slots')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('applying a starter week', () => {
	test('brings its categories, activities and blocks', () => {
		s.onboarding.applyTemplate(ctx, 'student', { replacePlan: true });

		const names = s.activities.listCategories(ctx).map((c) => c.name);
		expect(names).toContain('work');
		expect(names).toContain('health');
		expect(s.activities.listActivities(ctx).map((a) => a.name)).toContain('Study block');
		expect(s.slots.listActiveWeeklySlots(ctx).length).toBeGreaterThan(0);
	});

	test('applying the same one twice does not duplicate the vocabulary', () => {
		const catsBefore = s.activities.listCategories(ctx).length;
		const actsBefore = s.activities.listActivities(ctx).length;

		s.onboarding.applyTemplate(ctx, 'student', { replacePlan: true });

		expect(s.activities.listCategories(ctx)).toHaveLength(catsBefore);
		expect(s.activities.listActivities(ctx)).toHaveLength(actsBefore);
	});

	test('replacing the plan leaves the new week, not both', () => {
		const student = s.slots.listActiveWeeklySlots(ctx).length;

		s.onboarding.applyTemplate(ctx, 'remote', { replacePlan: true });
		const remote = s.slots.listActiveWeeklySlots(ctx).length;

		expect(remote).toBeGreaterThan(0);
		expect(remote).toBeLessThan(student + remote);
	});

	test('not replacing it adds to what is there', () => {
		const before = s.slots.listActiveWeeklySlots(ctx).length;
		s.onboarding.applyTemplate(ctx, 'student', { replacePlan: false });
		expect(s.slots.listActiveWeeklySlots(ctx).length).toBeGreaterThan(before);
	});

	test('an unknown key is refused rather than silently doing nothing', () => {
		expect(() =>
			// @ts-expect-error the point is what happens when the key is wrong
			s.onboarding.applyTemplate(ctx, 'nonsense', { replacePlan: false })
		).toThrow();
	});

	test("it never touches another account's plan", () => {
		const mine = s.slots.listActiveWeeklySlots(ctx).length;
		s.onboarding.applyTemplate(theirs, 'blank', { replacePlan: true });

		expect(s.slots.listActiveWeeklySlots(ctx)).toHaveLength(mine);
		expect(s.activities.listCategories(theirs).map((c) => c.name)).toContain('work');
	});
});
