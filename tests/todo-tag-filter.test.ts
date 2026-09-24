/**
 * Narrowing the todo list by labels, in SQL.
 *
 * The screens filter the list they already hold with `passesTagFilter`; the
 * service answers the same question in a `WHERE` for the MCP listings. Every
 * case here is checked against both, so the two readings cannot drift apart.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';
import { passesTagFilter, UNTAGGED, type TagFilter } from '../src/lib/tag-filter';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let todos: typeof import('../src/lib/services/todos');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	todos = await import('../src/lib/services/todos');
	ctx = { userId: OWNER, now: new Date('2026-09-24T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	todos.createTodo(ctx, { title: 'home', tags: 'home' });
	todos.createTodo(ctx, { title: 'home urgent', tags: 'home urgent' });
	todos.createTodo(ctx, { title: 'home urgent done', tags: 'home urgent done' });
	todos.createTodo(ctx, { title: 'work', tags: 'work' });
	todos.createTodo(ctx, { title: 'bare' });
	// A stranger's rows carrying the same words must never come back.
	todos.createTodo(theirs, { title: 'their home', tags: 'home urgent' });
	todos.createTodo(theirs, { title: 'their bare' });
});

const filter = (over: Partial<TagFilter>): TagFilter => ({
	include: [],
	exclude: [],
	mode: 'any',
	...over
});

/** The titles the service lets through, checked against the client's reading. */
function titles(over: Partial<TagFilter>, who = ctx): string[] {
	const asked = filter(over);
	const got = todos.listTodos(who, { tags: asked }).map((one) => one.title);
	const client = todos
		.listTodos(who)
		.filter((one) =>
			passesTagFilter(
				one.tags.map((tag) => tag.name),
				asked
			)
		)
		.map((one) => one.title);
	expect(got).toEqual(client);
	return got.sort();
}

describe('listTodos with a tag filter', () => {
	test('no filter is every one of mine', () => {
		expect(titles({})).toEqual(['bare', 'home', 'home urgent', 'home urgent done', 'work']);
	});

	test('any: carrying one of them is enough', () => {
		expect(titles({ include: ['urgent', 'work'] })).toEqual([
			'home urgent',
			'home urgent done',
			'work'
		]);
	});

	test('all: carrying every one of them', () => {
		expect(titles({ include: ['home', 'urgent'], mode: 'all' })).toEqual([
			'home urgent',
			'home urgent done'
		]);
	});

	test('exclude drops anything carrying any of them', () => {
		expect(titles({ include: ['home'], exclude: ['done'] })).toEqual(['home', 'home urgent']);
		expect(titles({ exclude: ['home', 'work'] })).toEqual(['bare']);
	});

	test('untagged, kept and dropped', () => {
		expect(titles({ include: [UNTAGGED] })).toEqual(['bare']);
		expect(titles({ include: [UNTAGGED, 'work'] })).toEqual(['bare', 'work']);
		expect(titles({ exclude: [UNTAGGED, 'home'] })).toEqual(['work']);
	});

	test('a stranger sees only theirs, whatever the words', () => {
		expect(titles({ include: ['home'] }, theirs)).toEqual(['their home']);
		expect(titles({ include: [UNTAGGED] }, theirs)).toEqual(['their bare']);
		expect(titles({ include: ['work'] }, theirs)).toEqual([]);
	});

	test('inside one notebook, the same', async () => {
		const notebooks = await import('../src/lib/services/notebooks');
		const book = notebooks.createNotebook(ctx, { title: 'Garden' });
		todos.createTodo(ctx, { title: 'prune', tags: 'home', notebookId: book });
		todos.createTodo(ctx, { title: 'plant', tags: 'home done', notebookId: book });
		const inside = (over: Partial<TagFilter>) =>
			todos.listTodosIn(ctx, book, { tags: filter(over) }).map((one) => one.title);
		expect(inside({ include: ['home'], exclude: ['done'] })).toEqual(['prune']);
		expect(todos.listTodosIn(theirs, book, { tags: filter({ include: ['home'] }) })).toEqual([]);
	});
});
