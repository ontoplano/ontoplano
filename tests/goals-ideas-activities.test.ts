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

let goals: typeof import('../src/lib/services/goals');
let ideas: typeof import('../src/lib/services/ideas');
let activities: typeof import('../src/lib/services/activities');
let slots: typeof import('../src/lib/services/slots');
let todos: typeof import('../src/lib/services/todos');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	goals = await import('../src/lib/services/goals');
	ideas = await import('../src/lib/services/ideas');
	activities = await import('../src/lib/services/activities');
	slots = await import('../src/lib/services/slots');
	todos = await import('../src/lib/services/todos');
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
			targets: [{ value: 12, unit: 'books' }]
		});
		const target = goals.listGoals(ctx).find((g) => g.id === id)!.targets[0];
		goals.setTargetProgress(ctx, target.id, 5);

		const after = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(after.targets[0].currentValue).toBe(5);
		expect(after.progress.fraction).toBeCloseTo(5 / 12);
	});

	/*
	 * One goal, several things it wants. The point of the whole shape: a goal
	 * that needs three of one thing and five of another is one commitment, and
	 * how far along it is has to account for both.
	 */
	test('a goal can want several things at once', () => {
		const id = goals.createGoal(ctx, {
			title: 'Get the band going',
			horizon: 'year',
			targets: [
				{ value: 3, unit: 'gigs' },
				{ value: 5, unit: 'songs' }
			]
		});

		let goal = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(goal.targets.map((t) => t.unit)).toEqual(['gigs', 'songs']);
		expect(goal.progress.fraction).toBe(0);

		// Every gig played, no songs recorded: half way, not finished.
		goals.setTargetProgress(ctx, goal.targets[0].id, 3);
		goal = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(goal.targets[0].fraction).toBe(1);
		expect(goal.progress.fraction).toBe(0.5);

		// Overshooting one measure does not pay for another.
		goals.setTargetProgress(ctx, goal.targets[0].id, 30);
		goal = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(goal.progress.fraction).toBe(0.5);
	});

	/*
	 * Linked work and typed-in numbers are both ways of being measured, and a
	 * goal can have both. It used to be one or the other: a goal with an
	 * activity linked to it read "0 of 0 done" and no bar while its own number
	 * stood at seven of twelve.
	 */
	test('linked tasks and measures both count towards one goal', () => {
		const id = goals.createGoal(ctx, {
			title: 'Finish the course',
			horizon: 'month',
			targets: [{ value: 10, unit: 'chapters' }]
		});
		const first = todos.createTodo(ctx, { title: 'enrol' });
		const second = todos.createTodo(ctx, { title: 'pay the fee' });
		goals.setGoalLinks(ctx, id, { slotIds: [], todoIds: [first, second], activityIds: [] });
		todos.setTodoStatus(ctx, first, 'done');

		const target = goals.listGoals(ctx).find((g) => g.id === id)!.targets[0];
		goals.setTargetProgress(ctx, target.id, 5);

		// One todo of two, and half the chapters: the two average out.
		const goal = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(goal.progress.done).toBe(1);
		expect(goal.progress.total).toBe(2);
		expect(goal.progress.fraction).toBeCloseTo(0.5);
	});

	test('editing keeps the progress on a measure that stays', () => {
		const id = goals.createGoal(ctx, {
			title: 'Ship the release',
			horizon: 'quarter',
			targets: [
				{ value: 10, unit: 'bugs' },
				{ value: 2, unit: 'talks' }
			]
		});
		const before = goals.listGoals(ctx).find((g) => g.id === id)!.targets;
		goals.setTargetProgress(ctx, before[0].id, 4);

		// The unit is retyped and the second measure dropped; the four bugs stay.
		goals.updateGoal(ctx, id, {
			title: 'Ship the release',
			targets: [{ id: before[0].id, value: 10, unit: 'bugs fixed' }]
		});

		const after = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(after.targets).toHaveLength(1);
		expect(after.targets[0].unit).toBe('bugs fixed');
		expect(after.targets[0].currentValue).toBe(4);
	});

	test('a measure can be added and taken off without touching the rest', () => {
		const id = goals.createGoal(ctx, {
			title: 'Move house',
			horizon: 'month',
			targets: [{ value: 20, unit: 'boxes' }]
		});

		const added = goals.addGoalTarget(ctx, id, { value: 3, unit: 'viewings' });
		expect(goals.listGoals(ctx).find((g) => g.id === id)!.targets).toHaveLength(2);

		goals.removeGoalTarget(ctx, added);
		const after = goals.listGoals(ctx).find((g) => g.id === id)!;
		expect(after.targets.map((t) => t.unit)).toEqual(['boxes']);
	});

	// Leaving the measures out of an update must not wipe them: a caller that
	// only renames a goal knows nothing about what it counts.
	test('an update that says nothing about measures leaves them', () => {
		const id = goals.createGoal(ctx, {
			title: 'Learn Russian',
			horizon: 'year',
			targets: [{ value: 500, unit: 'words' }]
		});

		goals.updateGoal(ctx, id, { title: 'Learn Russian properly' });
		expect(goals.listGoals(ctx).find((g) => g.id === id)!.targets).toHaveLength(1);
	});

	test('a goal cannot be measured by more than the cap', () => {
		expect(() =>
			goals.createGoal(ctx, {
				title: 'Too much',
				horizon: 'year',
				targets: Array.from({ length: goals.MAX_TARGETS + 1 }, (_, i) => ({
					value: 1,
					unit: `thing ${i}`
				}))
			})
		).toThrow();
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
		const mine = goals.listGoals(ctx).find((g) => g.targets.length > 0)!;
		expect(() => goals.setTargetProgress(theirs, mine.targets[0].id, 1)).toThrow();
		expect(() => goals.removeGoalTarget(theirs, mine.targets[0].id)).toThrow();
		expect(() => goals.addGoalTarget(theirs, mine.id, { value: 1, unit: 'x' })).toThrow();
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

	/**
	 * The card writes "· edited <date>" whenever `updatedAt` differs from the
	 * creation date. Marking an idea applied used to move it, so a status
	 * change grew the row by a line of text and reflowed the card under it.
	 */
	test('marking one applied is not an edit of it', () => {
		const id = ideas.createIdea(ctx, { content: 'Read the long one' });
		const before = ideas.listIdeas(ctx).find((i) => i.id === id)!;

		ideas.toggleApplied(ctx, id, 'read it on the train');
		ideas.toggleFavorite(ctx, id);
		ideas.updateAppliedNote(ctx, id, 'read it twice');

		const after = ideas.listIdeas(ctx).find((i) => i.id === id)!;
		expect(after.updatedAt).toBe(before.updatedAt);
		// Which is the same as saying the card shows no edit marker at all: the
		// suite's clock does not move, so "unchanged" and "stamped again" would
		// look alike if this compared two stamps.
		expect(after.updatedAt).toBe(after.createdAt);
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
