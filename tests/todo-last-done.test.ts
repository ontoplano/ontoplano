import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * When a task was finished, which is not when it was last touched.
 *
 * A to-do list gets asked two questions: what is next, and what have I just
 * done. The second one was unanswerable — `updatedAt` moves for a renamed
 * title or a changed category, so ordering by it puts an edit above a
 * completion. `completedAt` is written the moment something becomes done and
 * cleared the moment it stops being, which is the part worth testing: a task
 * reopened must not sit at the top of a list of finished work.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let todos: typeof import('../src/lib/services/todos');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

const ctx = () => buildCtx(OWNER, { tz: 'UTC' });
const idOf = (made: unknown) => (typeof made === 'number' ? made : (made as { id: number }).id);

beforeAll(async () => {
	todos = await import('../src/lib/services/todos');
	({ buildCtx } = await import('../src/lib/services/ctx'));
});

describe('when a todo was finished', () => {
	it('is nothing until it is finished', () => {
		const id = idOf(todos.createTodo(ctx(), { title: 'unfinished' }));
		const made = todos.listTodos(ctx()).find((t) => t.id === id);
		expect(made?.completedAt).toBeNull();
	});

	it('is written the moment it is done', () => {
		const id = idOf(todos.createTodo(ctx(), { title: 'finished' }));
		todos.setTodoStatus(ctx(), id, 'done');

		const done = todos.listTodos(ctx()).find((t) => t.id === id);
		expect(done?.completedAt).toBeTruthy();
		expect(Date.parse(done!.completedAt!)).toBeLessThanOrEqual(Date.now() + 1000);
	});

	it('is cleared when it is reopened, so it leaves the finished list', () => {
		const id = idOf(todos.createTodo(ctx(), { title: 'back again' }));
		todos.setTodoStatus(ctx(), id, 'done');
		expect(todos.listTodos(ctx()).find((t) => t.id === id)?.completedAt).toBeTruthy();

		todos.setTodoStatus(ctx(), id, 'todo');
		expect(todos.listTodos(ctx()).find((t) => t.id === id)?.completedAt).toBeNull();
	});

	it('does not move when the task is merely edited', () => {
		const id = idOf(todos.createTodo(ctx(), { title: 'edited later' }));
		todos.setTodoStatus(ctx(), id, 'done');
		const when = todos.listTodos(ctx()).find((t) => t.id === id)?.completedAt;

		todos.updateTodo(ctx(), id, { title: 'edited later, renamed' });

		const after = todos.listTodos(ctx()).find((t) => t.id === id);
		expect(after?.title).toBe('edited later, renamed');
		expect(after?.completedAt, 'renaming it counted as doing it').toBe(when);
	});

	it('is the same answer for skipped as for never done', () => {
		// Skipped is closed, not finished: it did not happen, so it is not
		// something you did most recently.
		const id = idOf(todos.createTodo(ctx(), { title: 'skipped' }));
		todos.setTodoStatus(ctx(), id, 'skipped');
		expect(todos.listTodos(ctx()).find((t) => t.id === id)?.completedAt).toBeNull();
	});
});
