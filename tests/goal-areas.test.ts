/**
 * Goal areas: renamed, recoloured and put in order, by their owner only.
 *
 * The order is the one the area filter and the goal form list them in, so a
 * new area goes last rather than jumping ahead of an arrangement.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let goals: typeof import('../src/lib/services/goals');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	goals = await import('../src/lib/services/goals');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

const names = (c = ctx) => goals.listAreas(c).map((a) => a.name);

describe('goal areas', () => {
	test('a new area goes last, and moves one place either way', () => {
		const health = goals.createArea(ctx, { name: 'Health' });
		goals.createArea(ctx, { name: 'Career' });
		const money = goals.createArea(ctx, { name: 'Money' });
		expect(names()).toEqual(['Health', 'Career', 'Money']);

		goals.moveArea(ctx, money, -1);
		expect(names()).toEqual(['Health', 'Money', 'Career']);
		goals.moveArea(ctx, health, 1);
		expect(names()).toEqual(['Money', 'Health', 'Career']);

		// Past either end is nothing, not an error.
		goals.moveArea(ctx, money, -1);
		expect(names()).toEqual(['Money', 'Health', 'Career']);

		goals.createArea(ctx, { name: 'Study' });
		expect(names().at(-1)).toBe('Study');
	});

	test('rename and recolour, each leaving the other alone', () => {
		const id = goals.createArea(ctx, { name: 'Fitnes', color: '#0f766e' });
		goals.updateArea(ctx, id, { name: 'Fitness' });
		expect(goals.listAreas(ctx).find((a) => a.id === id)).toMatchObject({
			name: 'Fitness',
			color: '#0f766e'
		});
		goals.updateArea(ctx, id, { color: '#1d4ed8' });
		expect(goals.listAreas(ctx).find((a) => a.id === id)).toMatchObject({
			name: 'Fitness',
			color: '#1d4ed8'
		});
		expect(() => goals.updateArea(ctx, id, { color: 'blue' })).toThrow();
	});

	test('a name another area has is refused, not merged', () => {
		const a = goals.createArea(ctx, { name: 'Family' });
		const goal = goals.createGoal(ctx, { title: 'call home', horizon: 'week', areaId: a });
		const b = goals.createArea(ctx, { name: 'Friends' });
		expect(() => goals.updateArea(ctx, b, { name: 'Family' })).toThrow();
		expect(names()).toContain('Friends');
		// Its own name again is not a clash.
		goals.updateArea(ctx, a, { name: 'Family' });
		expect(goals.listGoals(ctx).find((g) => g.id === goal)?.areaName).toBe('Family');
	});

	test("a stranger's area is not found, and nothing about it changes", () => {
		const mine = goals.createArea(ctx, { name: 'Private', color: '#111111' });
		const before = goals.listAreas(ctx);

		expect(() => goals.updateArea(theirs, mine, { name: 'Taken' })).toThrow(/not found/i);
		expect(() => goals.updateArea(theirs, mine, { color: '#ffffff' })).toThrow(/not found/i);
		expect(() => goals.updateArea(theirs, mine, {})).toThrow(/not found/i);
		expect(() => goals.moveArea(theirs, mine, -1)).toThrow(/not found/i);

		// The same answer as for a row that does not exist.
		expect(() => goals.updateArea(theirs, 999_999, { name: 'x' })).toThrow(/not found/i);
		expect(goals.listAreas(ctx)).toEqual(before);
		expect(goals.listAreas(theirs)).toEqual([]);
	});

	test("moving one's own area never reorders a stranger's", () => {
		const s1 = goals.createArea(theirs, { name: 'One' });
		goals.createArea(theirs, { name: 'Two' });
		const mine = goals.listAreas(ctx).at(-1)!.id;
		goals.moveArea(ctx, mine, -1);
		expect(names(theirs)).toEqual(['One', 'Two']);
		goals.moveArea(theirs, s1, 1);
		expect(names(theirs)).toEqual(['Two', 'One']);
	});
});
