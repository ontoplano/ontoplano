/**
 * Narrowing a search.
 *
 * The parser is unit-tested beside the vocabulary; this is about whether the
 * narrowing actually reaches the query — that `todo:` returns only todos, that
 * `in:` stays inside one notebook, and that neither of them is a way to see
 * somebody else's rows.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	search: typeof import('../src/lib/server/services/search');
	todos: typeof import('../src/lib/server/services/todos');
	notebooks: typeof import('../src/lib/server/services/notebooks');
	diary: typeof import('../src/lib/server/services/diary');
	goals: typeof import('../src/lib/server/services/goals');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let kitchen: number;
let garden: number;

beforeAll(async () => {
	s = {
		search: await import('../src/lib/server/services/search'),
		todos: await import('../src/lib/server/services/todos'),
		notebooks: await import('../src/lib/server/services/notebooks'),
		diary: await import('../src/lib/server/services/diary'),
		goals: await import('../src/lib/server/services/goals')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	kitchen = s.notebooks.createNotebook(ctx, { title: 'Kitchen refit' });
	garden = s.notebooks.createNotebook(ctx, { title: 'Garden' });

	s.todos.createTodo(ctx, { title: 'order tiles', notebookId: kitchen });
	s.todos.createTodo(ctx, { title: 'tiles for the path', notebookId: garden });
	s.todos.createTodo(ctx, { title: 'tiles, unfiled' });
	s.diary.createEntry(ctx, { content: 'the tiles arrived', notebookId: kitchen });
	s.goals.createGoal(ctx, { title: 'finish the tiles', horizon: 'year', notebookId: garden });
});

const titles = (hits: { title: string }[]) => hits.map((h) => h.title).sort();

describe('narrowing by kind', () => {
	test('a bare search crosses every kind', () => {
		const kinds = new Set(s.search.search(ctx, 'tiles').map((h) => h.kind));
		expect(kinds.size).toBeGreaterThan(1);
	});

	test('todo: returns only todos', () => {
		const hits = s.search.search(ctx, 'todo:tiles');
		expect(hits.every((h) => h.kind === 'todo')).toBe(true);
		expect(titles(hits)).toEqual(['order tiles', 'tiles for the path', 'tiles, unfiled']);
	});

	test('two prefixes return both kinds and nothing else', () => {
		const kinds = new Set(s.search.search(ctx, 'todo: goal: tiles').map((h) => h.kind));
		expect([...kinds].sort()).toEqual(['goal', 'todo']);
	});
});

describe('narrowing by notebook', () => {
	test('in: stays inside the one it names', () => {
		expect(titles(s.search.search(ctx, 'in:Kitchen tiles'))).toEqual([
			'order tiles',
			'the tiles arrived'
		]);
	});

	test('three letters of the name will do', () => {
		expect(titles(s.search.search(ctx, 'in:Kit tiles'))).toEqual([
			'order tiles',
			'the tiles arrived'
		]);
	});

	test('a notebook that does not exist finds nothing rather than everything', () => {
		expect(s.search.search(ctx, 'in:nowhere tiles')).toEqual([]);
	});

	test('both narrowings at once', () => {
		expect(titles(s.search.search(ctx, 'todo: in:Garden tiles'))).toEqual(['tiles for the path']);
	});

	test('a prefix is not a way into another account', () => {
		expect(s.search.search(theirs, 'in:Kitchen tiles')).toEqual([]);
		expect(s.search.search(theirs, 'todo:tiles')).toEqual([]);
	});
});

describe('what is left to search for', () => {
	test('a query that is only a prefix searches for nothing', () => {
		expect(s.search.search(ctx, 'todo:')).toEqual([]);
		expect(s.search.search(ctx, 'in:Kitchen')).toEqual([]);
	});
});
