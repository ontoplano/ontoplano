/**
 * Things that never ended.
 *
 * The interesting part is what is *not* offered: something you finished has
 * ended, and a staple you have not bought since May is not a decision waiting
 * to be made. And, as everywhere, that an id from another account does nothing
 * and says nothing.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	stale: typeof import('../src/lib/server/services/stale');
	todos: typeof import('../src/lib/server/services/todos');
	ideas: typeof import('../src/lib/server/services/ideas');
	shopping: typeof import('../src/lib/server/services/shopping');
};

let s: Services;
/** "Now" is late August; anything stamped in January is four months past. */
let ctx: { userId: string; now: Date; tz: string };
let old: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

let ancient: number;
let ancientIdea: number;

beforeAll(async () => {
	s = {
		stale: await import('../src/lib/server/services/stale'),
		todos: await import('../src/lib/server/services/todos'),
		ideas: await import('../src/lib/server/services/ideas'),
		shopping: await import('../src/lib/server/services/shopping')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	old = { ...ctx, now: new Date('2026-01-10T09:00:00') };
	theirs = { ...ctx, userId: STRANGER };

	// Written in January, and not touched since.
	ancient = s.todos.createTodo(old, { title: 'learn the ukulele' });
	ancientIdea = s.ideas.createIdea(old, { content: 'a newsletter about bread' });
	s.shopping.createItem(old, { name: 'a proper chair', type: 'someday' });

	// And the ones that should never appear.
	const done = s.todos.createTodo(old, { title: 'renew the passport' });
	s.todos.setTodoStatus(old, done, 'done');
	s.shopping.createItem(old, { name: 'olive oil', type: 'replenish' });
	s.todos.createTodo(ctx, { title: 'written this week' });
});

describe('what is offered', () => {
	test('everything old and still open', () => {
		const titles = s.stale.listStale(ctx).map((t) => t.title);
		expect(titles).toContain('learn the ukulele');
		expect(titles).toContain('a newsletter about bread');
		expect(titles).toContain('a proper chair');
	});

	test('nothing you finished', () => {
		expect(s.stale.listStale(ctx).map((t) => t.title)).not.toContain('renew the passport');
	});

	test('nothing you replenish — that is a staple, not a decision', () => {
		expect(s.stale.listStale(ctx).map((t) => t.title)).not.toContain('olive oil');
	});

	test('nothing written this month', () => {
		expect(s.stale.listStale(ctx).map((t) => t.title)).not.toContain('written this week');
	});

	test('oldest first, so the worst offender is at the top', () => {
		const dates = s.stale.listStale(ctx).map((t) => t.since);
		expect([...dates].sort()).toEqual(dates);
	});
});

describe('answering the question', () => {
	test('"still real" resets the clock and changes nothing else', () => {
		expect(s.stale.keepStale(ctx, 'todo', ancient)).toBe(true);

		expect(s.stale.listStale(ctx).map((t) => t.title)).not.toContain('learn the ukulele');
		expect(s.todos.listTodos(ctx).find((t) => t.id === ancient)?.title).toBe('learn the ukulele');
	});

	test('"done, actually" closes it rather than deleting it', () => {
		const id = s.todos.createTodo(old, { title: 'renew the insurance' });
		expect(s.stale.completeStale(ctx, 'todo', id)).toBe(true);

		expect(s.stale.listStale(ctx).map((t) => t.title)).not.toContain('renew the insurance');
		expect(s.todos.listTodos(ctx).find((t) => t.id === id)?.status).toBe('done');
	});

	test('an idea has no done state, so it keeps its other two answers', () => {
		const idea = s.ideas.createIdea(old, { content: 'not a task at all' });
		expect(s.stale.completeStale(ctx, 'idea', idea)).toBe(false);
		expect(s.stale.listStale(ctx).map((t) => t.title)).toContain('not a task at all');
	});

	test('"let it go" removes it', () => {
		expect(s.stale.dropStale(ctx, 'idea', ancientIdea)).toBe(true);
		expect(s.ideas.listIdeas(ctx).find((i) => i.id === ancientIdea)).toBeUndefined();
	});

	test('a stranger can neither keep nor drop, and is told nothing', () => {
		const mine = s.stale.listStale(ctx);
		const target = mine[0];

		expect(s.stale.keepStale(theirs, target.sort, target.id)).toBe(false);
		expect(s.stale.dropStale(theirs, target.sort, target.id)).toBe(false);
		expect(s.stale.listStale(ctx)).toHaveLength(mine.length);
	});

	test('another account sees none of it', () => {
		expect(s.stale.listStale(theirs)).toEqual([]);
	});
});
