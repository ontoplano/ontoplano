/**
 * Three services whose rules are quiet and load-bearing.
 *
 * A goal is anchored to the *period* containing the date you chose, not to the
 * date — otherwise two goals in the same quarter disagree about when that
 * quarter starts, and every comparison between them is wrong. An activity that
 * blocks point at cannot simply be deleted out from under them. And an idea's
 * tags are replaced wholesale, so removing one is posting the rest.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let goals: typeof import('../src/lib/server/services/goals');
let ideas: typeof import('../src/lib/server/services/ideas');
let activities: typeof import('../src/lib/server/services/activities');
let slots: typeof import('../src/lib/server/services/slots');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	goals = await import('../src/lib/server/services/goals');
	ideas = await import('../src/lib/server/services/ideas');
	activities = await import('../src/lib/server/services/activities');
	slots = await import('../src/lib/server/services/slots');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('categories and activities', () => {
	test('a category is created with its colour', () => {
		const id = activities.createCategory(ctx, { name: 'Health', color: '#0f766e' });
		expect(activities.listCategories(ctx).find((c) => c.id === id)!.name).toBe('Health');
	});

	test('two categories cannot share a name', () => {
		expect(() => activities.createCategory(ctx, { name: 'Health' })).toThrow();
	});

	test('an activity belongs to a category and can be put away', () => {
		const health = activities.listCategories(ctx).find((c) => c.name === 'Health')!;
		const id = activities.createActivity(ctx, { name: 'Gym', categoryId: health.id });

		activities.toggleActivityActive(ctx, id);
		expect(activities.listActivities(ctx, { activeOnly: true }).some((a) => a.id === id)).toBe(
			false
		);
		expect(activities.listActivities(ctx).some((a) => a.id === id)).toBe(true);
	});

	test('an activity the plan points at is not deleted out from under it', () => {
		const health = activities.listCategories(ctx).find((c) => c.name === 'Health')!;
		const russian = activities.createActivity(ctx, { name: 'Russian', categoryId: health.id });

		slots.createSlot(ctx, {
			weekday: 1,
			startTime: '18:00',
			durationMinutes: 60,
			mode: 'activity',
			activityId: russian
		});

		// A block pointing at a row that is gone is a block that cannot say what
		// it is for.
		expect(() => activities.deleteActivity(ctx, russian)).toThrow();
	});

	test("another account's category is not yours to rename", () => {
		const mine = activities.listCategories(ctx)[0];
		expect(() => activities.updateCategory(theirs, mine.id, { name: 'taken' })).toThrow();
	});
});

describe('goals', () => {
	test('anchor to the period containing the date, not to the date', () => {
		// Two goals a fortnight apart in the same quarter must agree about when
		// that quarter starts, or nothing can be compared between them.
		const first = goals.createGoal(ctx, {
			title: 'Ship it',
			horizon: 'quarter',
			startDate: '2026-08-03'
		});
		const second = goals.createGoal(ctx, {
			title: 'Ship it again',
			horizon: 'quarter',
			startDate: '2026-08-19'
		});

		const all = goals.listGoals(ctx);
		const a = all.find((g) => g.id === first)!;
		const b = all.find((g) => g.id === second)!;
		expect(a.periodStart).toBe(b.periodStart);
	});

	test('refuse a horizon that is not one', () => {
		expect(() => goals.createGoal(ctx, { title: 'x', horizon: 'fortnight' })).toThrow();
	});

	test('record progress against a target', () => {
		const id = goals.createGoal(ctx, {
			title: 'Read twelve books',
			horizon: 'year',
			targetValue: 12,
			unit: 'books'
		});
		goals.setGoalProgress(ctx, id, 5);
		expect(goals.listGoals(ctx).find((g) => g.id === id)!.currentValue).toBe(5);
	});

	test('closing one stamps when, and reopening clears it', () => {
		const id = goals.createGoal(ctx, { title: 'Learn to sail', horizon: 'year' });

		goals.closeGoal(ctx, id, { status: 'achieved', outcome: 'passed the course' });
		let goal = goals.listGoals(ctx, { includeClosed: true }).find((g) => g.id === id)!;
		expect(goal.status).toBe('achieved');
		expect(goal.closedAt).toBeTruthy();

		// A reopened goal must not read as having been finished at some point.
		goals.closeGoal(ctx, id, { status: 'open' });
		goal = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(goal.closedAt).toBeFalsy();
	});

	test('a closed goal is out of the list unless asked for', () => {
		const id = goals.createGoal(ctx, { title: 'Abandoned', horizon: 'month' });
		goals.closeGoal(ctx, id, { status: 'abandoned' });

		expect(goals.listGoals(ctx).some((g) => g.id === id)).toBe(false);
		expect(goals.listGoals(ctx, { includeClosed: true }).some((g) => g.id === id)).toBe(true);
	});

	test('an area groups goals, and deleting it leaves them', () => {
		const area = goals.createArea(ctx, { name: 'Fitness', color: '#0f766e' });
		const id = goals.createGoal(ctx, { title: 'Run 5k', horizon: 'month', areaId: area });

		goals.deleteArea(ctx, area);
		expect(goals.listAreas(ctx).some((a) => a.id === area)).toBe(false);
		expect(goals.listGoals(ctx).some((g) => g.id === id)).toBe(true);
	});

	test('belong to one account', () => {
		const mine = goals.listGoals(ctx)[0];
		expect(() => goals.setGoalProgress(theirs, mine.id, 1)).toThrow();
		expect(() => goals.deleteGoal(theirs, mine.id)).toThrow();
	});
});

describe('ideas', () => {
	test('carry their tags, and replacing them is posting the rest', () => {
		const id = ideas.createIdea(ctx, { content: 'A bread newsletter', tags: 'food, someday' });
		expect(
			ideas
				.listIdeas(ctx)
				.find((i) => i.id === id)!
				.tags.map((t) => t.name)
		).toEqual(expect.arrayContaining(['food', 'someday']));

		ideas.updateIdea(ctx, id, { content: 'A bread newsletter', tags: 'food' });
		expect(
			ideas
				.listIdeas(ctx)
				.find((i) => i.id === id)!
				.tags.map((t) => t.name)
		).toEqual(['food']);
	});

	test('can be marked applied, with a note about where it went', () => {
		const id = ideas.createIdea(ctx, { content: 'Meal plan feeds the list' });
		ideas.toggleApplied(ctx, id, 'shipped in v2');

		const idea = ideas.listIdeas(ctx).find((i) => i.id === id)!;
		expect(idea.isApplied).toBeTruthy();
		expect(idea.appliedNote).toBe('shipped in v2');

		ideas.toggleApplied(ctx, id, '');
		expect(ideas.listIdeas(ctx).find((i) => i.id === id)!.isApplied).toBeFalsy();
	});

	test('can be starred', () => {
		const id = ideas.createIdea(ctx, { content: 'Worth keeping' });
		ideas.toggleFavorite(ctx, id);
		expect(ideas.listIdeas(ctx).find((i) => i.id === id)!.favorite).toBeTruthy();
	});

	test('refuse an empty one', () => {
		expect(() => ideas.createIdea(ctx, { content: '   ' })).toThrow();
	});

	test("are not another account's to change or delete", () => {
		const mine = ideas.listIdeas(ctx)[0];
		expect(() => ideas.updateIdea(theirs, mine.id, { content: 'taken' })).toThrow();
		expect(() => ideas.deleteIdea(theirs, mine.id)).toThrow();
	});
});
