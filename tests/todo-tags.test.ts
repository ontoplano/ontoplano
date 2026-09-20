/**
 * Labels on a task.
 *
 * Not a second vocabulary: `tags` holds one row per (account, name) and every
 * room that tags anything joins to it, so a word used on a diary entry is the
 * same word on a task. The reason tasks wanted them is one the other rooms did
 * not have — several assistants working the same list need a way to say which
 * of them touched what, and a label is how.
 *
 * The rule that costs the most if it is wrong is `undefined` meaning *leave
 * them alone*. Not every screen that edits a todo offers the field, and an
 * update that treated silence as "none" would strip the labels an assistant
 * had just written every time somebody renamed a task on the board.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';
import { db } from '../src/lib/db/index.js';
import { tags, todoTags } from '../src/lib/db/schema';
import { and, eq } from 'drizzle-orm';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let todos: typeof import('../src/lib/services/todos');
let diary: typeof import('../src/lib/services/diary');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	todos = await import('../src/lib/services/todos');
	diary = await import('../src/lib/services/diary');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

const named = (id: number, of = ctx) =>
	todos
		.listTodos(of)
		.find((t) => t.id === id)!
		.tags.map((one) => one.name);

/** When one label went on this task, read straight off the join. */
function taggedAt(todoId: number, name: string): string | null {
	const row = db
		.select({ at: todoTags.taggedAt })
		.from(todoTags)
		.innerJoin(tags, eq(todoTags.tagId, tags.id))
		.where(and(eq(todoTags.todoId, todoId), eq(tags.name, name)))
		.get();
	return row?.at ?? null;
}

describe('a task carries labels', () => {
	test('written at birth, normalised the way every other tag is', () => {
		const id = todos.createTodo(ctx, { title: 'renew the domain', tags: '#A1, Done' });
		expect(named(id)).toEqual(['a1', 'done']);
	});

	test('takes them from spaces as readily as commas', () => {
		const id = todos.createTodo(ctx, { title: 'book the van', tags: 'a2 blocked' });
		expect(named(id)).toEqual(['a2', 'blocked']);
	});

	test('has none when nobody said any', () => {
		const id = todos.createTodo(ctx, { title: 'water the plants' });
		expect(named(id)).toEqual([]);
	});

	test('comes back on every list a todo appears in', () => {
		const id = todos.createTodo(ctx, { title: 'on the day', tags: 'a1' });
		todos.scheduleTodo(ctx, id, '2026-08-17');
		expect(todos.listForDate(ctx, '2026-08-17').find((t) => t.id === id)!.tags).toHaveLength(1);
	});
});

describe('changing them', () => {
	test('replaces what was there', () => {
		const id = todos.createTodo(ctx, { title: 'fix the light', tags: 'a1 done' });
		todos.updateTodo(ctx, id, { title: 'fix the light', tags: 'a2' });
		expect(named(id)).toEqual(['a2']);
	});

	test('an empty string takes them all off', () => {
		const id = todos.createTodo(ctx, { title: 'call the vet', tags: 'a1' });
		todos.updateTodo(ctx, id, { title: 'call the vet', tags: '' });
		expect(named(id)).toEqual([]);
	});

	test('saying nothing about them leaves them alone', () => {
		// The board's inline editor has no tags box. An update from there must
		// not quietly strip what an assistant wrote.
		const id = todos.createTodo(ctx, { title: 'sand the door', tags: 'a1 wood' });
		todos.updateTodo(ctx, id, { title: 'sand the door properly' });
		expect(named(id)).toEqual(['a1', 'wood']);
	});
});

describe('one vocabulary, not one per room', () => {
	test('a word used on a diary entry is the same word on a task', () => {
		diary.createEntry(ctx, { content: 'a long day', tags: 'shared' });
		const id = todos.createTodo(ctx, { title: 'sleep', tags: 'shared' });

		const rows = diary.listTags(ctx).filter((one) => one.name === 'shared');
		expect(rows).toHaveLength(1);
		expect(named(id)).toEqual(['shared']);
	});

	test('a word nothing points at any more leaves the vocabulary', () => {
		const id = todos.createTodo(ctx, { title: 'briefly', tags: 'ephemeral' });
		expect(diary.listTags(ctx).some((one) => one.name === 'ephemeral')).toBe(true);
		todos.deleteTodo(ctx, id);
		expect(diary.listTags(ctx).some((one) => one.name === 'ephemeral')).toBe(false);
	});

	test('a word another room still uses is kept', () => {
		diary.createEntry(ctx, { content: 'kept', tags: 'held' });
		const id = todos.createTodo(ctx, { title: 'passing', tags: 'held' });
		todos.deleteTodo(ctx, id);
		expect(diary.listTags(ctx).some((one) => one.name === 'held')).toBe(true);
	});
});

describe('a stranger', () => {
	test('cannot label somebody else’s task', () => {
		const id = todos.createTodo(ctx, { title: 'mine', tags: 'a1' });
		expect(() => todos.updateTodo(theirs, id, { title: 'theirs now', tags: 'a9' })).toThrow();
		expect(named(id)).toEqual(['a1']);
	});

	test('does not see it, and their own vocabulary is their own', () => {
		const id = todos.createTodo(ctx, { title: 'private', tags: 'secret' });
		expect(todos.listTodos(theirs).some((t) => t.id === id)).toBe(false);
		expect(diary.listTags(theirs).some((one) => one.name === 'secret')).toBe(false);
	});
});

describe('labelling one without disturbing the rest', () => {
	test('adds a label and keeps the ones already there', () => {
		const id = todos.createTodo(ctx, { title: 'renew the domain', tags: 'a1 blocked' });
		expect(todos.tagTodo(ctx, id, { add: 'done-by-ai' })).toEqual(['a1', 'blocked', 'done-by-ai']);
		expect(named(id)).toEqual(['a1', 'blocked', 'done-by-ai']);
	});

	test('takes one off and leaves the others', () => {
		const id = todos.createTodo(ctx, { title: 'sand the door', tags: 'a1 blocked wood' });
		todos.tagTodo(ctx, id, { remove: 'blocked' });
		expect(named(id)).toEqual(['a1', 'wood']);
	});

	test('adds and removes in one call', () => {
		const id = todos.createTodo(ctx, { title: 'book the van', tags: 'blocked' });
		expect(todos.tagTodo(ctx, id, { add: 'done-by-ai', remove: 'blocked' })).toEqual([
			'done-by-ai'
		]);
	});

	test('a word named in both is removed, which is the safer reading', () => {
		const id = todos.createTodo(ctx, { title: 'contradiction', tags: 'a1' });
		expect(todos.tagTodo(ctx, id, { add: 'a1', remove: 'a1' })).toEqual([]);
	});

	test('adding one it already has changes nothing and does not duplicate it', () => {
		const id = todos.createTodo(ctx, { title: 'again', tags: 'a1' });
		todos.tagTodo(ctx, id, { add: '#A1' });
		expect(named(id)).toEqual(['a1']);
	});

	test('removing one it does not have is not an error', () => {
		const id = todos.createTodo(ctx, { title: 'nothing to remove', tags: 'a1' });
		expect(todos.tagTodo(ctx, id, { remove: 'never-had-it' })).toEqual(['a1']);
	});

	test('a stranger cannot label somebody else’s task', () => {
		const id = todos.createTodo(ctx, { title: 'mine', tags: 'a1' });
		expect(() => todos.tagTodo(theirs, id, { add: 'theirs' })).toThrow();
		expect(named(id)).toEqual(['a1']);
	});
});
