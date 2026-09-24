import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
let todos: typeof import('../src/lib/services/todos');
let notebooks: typeof import('../src/lib/services/notebooks');
const ctx = { userId: OWNER, now: new Date('2026-09-24T12:00:00Z'), tz: 'UTC' };
const stranger = { ...ctx, userId: STRANGER };
beforeAll(async () => {
	todos = await import('../src/lib/services/todos');
	notebooks = await import('../src/lib/services/notebooks');
});
const row = (id: number, who = ctx) => todos.listTodos(who).find((todo) => todo.id === id);
const make = () => todos.createTodo(ctx, { title: 'Batch task', tags: 'keep old' });

describe('task selections', () => {
	test('changes status and edits tags without losing other labels', () => {
		const ids = [make(), make()];
		expect(todos.batchTodos(ctx, 'status', [...ids, ids[0]], { status: 'doing' })).toBe(2);
		expect(ids.map((id) => row(id)?.status)).toEqual(['doing', 'doing']);
		todos.batchTodos(ctx, 'tag', ids, { add: 'new', remove: 'old' });
		expect(ids.map((id) => row(id)?.tags.map((tag) => tag.name))).toEqual([
			['keep', 'new'],
			['keep', 'new']
		]);
	});
	test('moves to unique notebook numbers, preserves numbers on a no-op and can unfile', () => {
		const notebook = notebooks.createNotebook(ctx, { title: 'Batch destination' });
		const ids = [make(), make()];
		todos.batchTodos(ctx, 'notebook', ids, { notebookId: notebook });
		const seqs = ids.map((id) => row(id)?.notebookSeq);
		expect(new Set(seqs).size).toBe(2);
		expect(ids.map((id) => row(id)?.notebookId)).toEqual([notebook, notebook]);
		todos.batchTodos(ctx, 'notebook', ids, { notebookId: notebook });
		expect(ids.map((id) => row(id)?.notebookSeq)).toEqual(seqs);
		todos.batchTodos(ctx, 'notebook', ids, { notebookId: '' });
		expect(ids.map((id) => [row(id)?.notebookId, row(id)?.notebookSeq])).toEqual([
			[null, null],
			[null, null]
		]);
	});
	for (const verb of ['status', 'tag', 'notebook', 'remove'] as const) {
		test(`${verb} rolls back when any selected task belongs to someone else`, () => {
			const id = make();
			const theirs = todos.createTodo(stranger, { title: 'Private task' });
			const before = row(id);
			const other = row(theirs, stranger);
			const what = { status: 'done', add: 'changed', notebookId: '' };
			expect(() => todos.batchTodos(ctx, verb, [id, theirs], what)).toThrow();
			expect(row(id)).toEqual(before);
			expect(row(theirs, stranger)).toEqual(other);
			expect(() => todos.batchTodos(ctx, verb, [id, 99999999], what)).toThrow();
			expect(row(id)).toEqual(before);
		});
	}
	test('rejects a foreign destination without moving any tasks', () => {
		const id = make();
		const destination = notebooks.createNotebook(stranger, { title: 'Private notebook' });
		expect(() => todos.batchTodos(ctx, 'notebook', [id], { notebookId: destination })).toThrow();
		expect(row(id)?.notebookId).toBeNull();
	});
	test('rejects empty, malformed and oversized selections rather than applying part', () => {
		const id = make();
		for (const ids of [[], [id, 'oops'], [id, -1], Array(501).fill(id)]) {
			expect(() => todos.batchTodos(ctx, 'remove', ids, {})).toThrow();
			expect(row(id)).toBeDefined();
		}
		expect(() => todos.batchTodos(ctx, 'status', [id], { status: 'invalid' })).toThrow();
		expect(() => todos.batchTodos(ctx, 'notebook', [id], {})).toThrow();
	});
	test('deletes exactly the selection', () => {
		const ids = [make(), make()];
		const kept = make();
		todos.batchTodos(ctx, 'remove', ids, {});
		expect(ids.map((id) => row(id))).toEqual([undefined, undefined]);
		expect(row(kept)).toBeDefined();
	});
});
