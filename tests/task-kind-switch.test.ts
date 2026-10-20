/**
 * A task changing kind: todo, one-off block, repeating block, in any order.
 *
 * Each kind lives in its own table, so every switch is a new row with a new id.
 * The editor that made the switch keeps working on the thing afterwards — it
 * saves, it switches back — and it can only do that by the id the switch
 * handed it. Naming the old one is how "Make it recurrent" then "Make it once
 * only" answered "Not found" — or, when a row in the other table happened to
 * carry that number, switched a different block altogether.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let slots: typeof import('../src/lib/services/slots');
let todos: typeof import('../src/lib/services/todos');
let tags: typeof import('../src/lib/services/tags');
let activities: typeof import('../src/lib/services/activities');
let workouts: typeof import('../src/lib/services/workouts');
let errors: typeof import('../src/lib/services/errors');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

// A Wednesday, so the weekday a one-off repeats on is not the default Monday.
const WEDNESDAY = '2026-08-19';
const WEDNESDAY_INDEX = 2;
const THURSDAY = '2026-08-20';

beforeAll(async () => {
	slots = await import('../src/lib/services/slots');
	todos = await import('../src/lib/services/todos');
	tags = await import('../src/lib/services/tags');
	activities = await import('../src/lib/services/activities');
	workouts = await import('../src/lib/services/workouts');
	errors = await import('../src/lib/services/errors');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
});

function weekly(label: string, extra: Record<string, unknown> = {}): number {
	return slots.createSlot(ctx, {
		weekday: WEDNESDAY_INDEX,
		startTime: '08:15',
		durationMinutes: 30,
		mode: 'category',
		categoryId: work,
		label,
		...extra
	});
}

const slotById = (id: number) => slots.listWeeklySlots(ctx).find((s) => s.id === id);
const oneOffById = (id: number) =>
	slots.listExceptionals(ctx, '2026-01-01', '2027-01-01').find((e) => e.id === id);

describe('repeating and once only, back and forth', () => {
	test('switching back uses the id the first switch returned', () => {
		const slot = weekly('standup');

		const once = slots.convertRepeat(ctx, slot, { to: 'once', date: WEDNESDAY });
		expect(once.kind).toBe('exceptional');
		expect(oneOffById(once.id)?.label).toBe('standup');
		expect(slotById(slot)).toBeUndefined();

		const again = slots.convertRepeat(ctx, once.id, { to: 'weekly', date: WEDNESDAY });
		expect(again.kind).toBe('slot');
		expect(slotById(again.id)?.label).toBe('standup');
		expect(slotById(again.id)?.weekday).toBe(WEDNESDAY_INDEX);

		const onceMore = slots.convertRepeat(ctx, again.id, { to: 'once', date: THURSDAY });
		expect(oneOffById(onceMore.id)?.date).toBe(THURSDAY);
	});

	test('everything the block says about itself travels, both ways', () => {
		const slot = weekly('with everything', {
			remindLeadMinutes: 10,
			ratings: { urgency: 4, interest: 2, ease: 3 },
			attributes: JSON.stringify({ link: 'https://example.com' }),
			tags: 'deep, morning'
		});

		const once = slots.convertRepeat(ctx, slot, { to: 'once', date: WEDNESDAY });
		const one = oneOffById(once.id)!;
		expect(one.remindLeadMinutes).toBe(10);
		expect([one.urgency, one.interest, one.ease]).toEqual([4, 2, 3]);
		expect(JSON.parse(one.attributes)).toEqual({ link: 'https://example.com' });
		expect(tags.tagsForBlock('exceptional', once.id, OWNER).map((t) => t.name)).toEqual([
			'deep',
			'morning'
		]);

		const back = slots.convertRepeat(ctx, once.id, { to: 'weekly', date: WEDNESDAY });
		const again = slotById(back.id)!;
		expect(again.remindLeadMinutes).toBe(10);
		expect([again.urgency, again.interest, again.ease]).toEqual([4, 2, 3]);
		expect(tags.tagsForBlock('recurring', back.id, OWNER).map((t) => t.name)).toEqual([
			'deep',
			'morning'
		]);
	});

	test('a workout block switches without losing its workout', () => {
		// The workout column was not carried, and a workout-mode row without one
		// breaks the table's own check — the switch failed outright.
		const workout = workouts.createWorkout(ctx, { title: 'Legs' });
		const slot = weekly('legs', { mode: 'workout', workoutId: workout, categoryId: undefined });

		const once = slots.convertRepeat(ctx, slot, { to: 'once', date: WEDNESDAY });
		expect(oneOffById(once.id)?.workoutId).toBe(workout);
		const back = slots.convertRepeat(ctx, once.id, { to: 'weekly', date: WEDNESDAY });
		expect(slotById(back.id)?.workoutId).toBe(workout);
	});

	test('a stranger cannot switch somebody else’s block', () => {
		const slot = weekly('mine');
		expect(() => slots.convertRepeat(theirs, slot, { to: 'once', date: WEDNESDAY })).toThrow(
			errors.NotFoundError
		);
		expect(slotById(slot)).toBeTruthy();
	});
});

describe('todo, one-off and repeating, in a chain', () => {
	test('todo → one-off → repeating → one-off → todo', () => {
		const todoId = todos.createTodo(ctx, {
			title: 'water the plants',
			categoryId: work,
			ratings: { urgency: 3 }
		});

		const promoted = todos.promoteTodo(ctx, { todoId, date: WEDNESDAY, startTime: '09:00' });
		if (!promoted.ok) throw new Error(promoted.message);
		expect(oneOffById(promoted.id)?.label).toBe('water the plants');

		const repeating = slots.convertRepeat(ctx, promoted.id, { to: 'weekly', date: WEDNESDAY });
		expect(slotById(repeating.id)?.label).toBe('water the plants');
		expect(slotById(repeating.id)?.urgency).toBe(3);

		const once = slots.convertRepeat(ctx, repeating.id, { to: 'once', date: THURSDAY });
		expect(oneOffById(once.id)?.date).toBe(THURSDAY);

		const { todoId: back } = todos.demoteToTodo(ctx, once.id);
		const todo = todos.listUnscheduled(ctx).find((t) => t.id === back)!;
		expect(todo.title).toBe('water the plants');
		expect(todo.ratings.urgency).toBe(3);
		expect(oneOffById(once.id)).toBeUndefined();
	});

	test('a todo scheduled, made repeating and made once again ends up on one day', () => {
		const todoId = todos.createTodo(ctx, { title: 'call the bank', categoryId: work });
		const promoted = todos.promoteTodo(ctx, { todoId, date: WEDNESDAY, startTime: '10:00' });
		if (!promoted.ok) throw new Error(promoted.message);

		const repeating = slots.convertRepeat(ctx, promoted.id, { to: 'weekly', date: WEDNESDAY });
		const once = slots.convertRepeat(ctx, repeating.id, { to: 'once', date: WEDNESDAY });

		const named = (label: string) =>
			slots.listExceptionals(ctx, '2026-01-01', '2027-01-01').filter((e) => e.label === label);
		expect(named('call the bank').map((e) => e.id)).toEqual([once.id]);
		expect(slots.listWeeklySlots(ctx).some((s) => s.label === 'call the bank')).toBe(false);
	});

	test('promoting a todo keeps its labels on the block', () => {
		const todoId = todos.createTodo(ctx, {
			title: 'plan the garden',
			categoryId: work,
			tags: 'garden outside'
		});
		const promoted = todos.promoteTodo(ctx, { todoId, date: WEDNESDAY, startTime: '11:00' });
		if (!promoted.ok) throw new Error(promoted.message);
		expect(tags.tagsForBlock('exceptional', promoted.id, OWNER).map((tag) => tag.name)).toEqual([
			'garden',
			'outside'
		]);
	});
});
