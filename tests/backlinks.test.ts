/**
 * The other direction.
 *
 * A goal has always known its todos; the todo knew nothing. These check that
 * the reverse lookup finds the same edges, keeps them inside one account, and
 * costs one query rather than one per row.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	backlinks: typeof import('../src/lib/server/services/backlinks');
	goals: typeof import('../src/lib/server/services/goals');
	todos: typeof import('../src/lib/server/services/todos');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

let fitness: number;
let reading: number;
let runTodo: number;

beforeAll(async () => {
	s = {
		backlinks: await import('../src/lib/server/services/backlinks'),
		goals: await import('../src/lib/server/services/goals'),
		todos: await import('../src/lib/server/services/todos')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	fitness = s.goals.createGoal(ctx, { title: 'Run a half marathon', horizon: 'year' });
	reading = s.goals.createGoal(ctx, { title: 'Read twelve books', horizon: 'year' });

	runTodo = s.todos.createTodo(ctx, { title: 'Buy running shoes' });
	s.goals.setGoalLinks(ctx, fitness, { slotIds: [], todoIds: [runTodo], activityIds: [] });
});

describe('a todo knows what it is for', () => {
	test('the goal it was linked to', () => {
		const links = s.backlinks.goalBacklinks(ctx);
		expect(links.todos[runTodo]).toEqual([
			{ id: fitness, title: 'Run a half marathon', status: 'open' }
		]);
	});

	test('a todo linked to nothing is simply absent', () => {
		const loose = s.todos.createTodo(ctx, { title: 'Nothing to do with anything' });
		expect(s.backlinks.goalBacklinks(ctx).todos[loose]).toBeUndefined();
	});

	test('two goals both show, in title order', () => {
		s.goals.setGoalLinks(ctx, reading, { slotIds: [], todoIds: [runTodo], activityIds: [] });
		const titles = s.backlinks.goalBacklinks(ctx).todos[runTodo].map((g) => g.title);
		expect(titles).toEqual(['Read twelve books', 'Run a half marathon']);
	});

	test('unlinking removes it', () => {
		s.goals.setGoalLinks(ctx, reading, { slotIds: [], todoIds: [], activityIds: [] });
		const titles = s.backlinks.goalBacklinks(ctx).todos[runTodo].map((g) => g.title);
		expect(titles).toEqual(['Run a half marathon']);
	});
});

describe('backlinks stay inside one account', () => {
	test('a stranger sees none of them', () => {
		const links = s.backlinks.goalBacklinks(theirs);
		expect(links.todos).toEqual({});
		expect(links.slots).toEqual({});
		expect(links.activities).toEqual({});
	});
});
