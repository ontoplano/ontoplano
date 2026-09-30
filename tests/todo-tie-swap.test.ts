import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * Two tasks rated alike, put the other way round.
 *
 * A tie in the three ratings used to go to the older task, always. Swapping
 * two of them is the way to say otherwise — and it must not be a number that
 * climbs every time somebody presses an arrow.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let todos: typeof import('../src/lib/services/todos');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let compareByPriority: typeof import('../src/lib/ratings').compareByPriority;

const ctx = (who = OWNER) => buildCtx(who, { tz: 'UTC' });
const same = { urgency: 4, ease: 3, interest: 2 };

/** The ids of these tasks in the order the queue reads them. */
function queued(ids: number[]): number[] {
	return todos
		.listTodos(ctx())
		.filter((t) => ids.includes(t.id))
		.sort(compareByPriority)
		.map((t) => t.id);
}

beforeAll(async () => {
	todos = await import('../src/lib/services/todos');
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ compareByPriority } = await import('../src/lib/ratings'));
});

describe('swapping two tied tasks', () => {
	it('puts them the other way round', () => {
		const a = todos.createTodo(ctx(), { title: 'older', ratings: same });
		const b = todos.createTodo(ctx(), { title: 'newer', ratings: same });
		expect(queued([a, b])).toEqual([a, b]);

		todos.swapTiedTodos(ctx(), b, a);
		expect(queued([a, b])).toEqual([b, a]);

		todos.swapTiedTodos(ctx(), a, b);
		expect(queued([a, b])).toEqual([a, b]);
	});

	it('hands out the values the tie already held, so nothing climbs', () => {
		const ids = [1, 2, 3].map((n) =>
			todos.createTodo(ctx(), { title: `tied ${n}`, ratings: { ...same, interest: 5 } })
		);
		const before = todos
			.listTodos(ctx())
			.filter((t) => ids.includes(t.id))
			.map((t) => t.sortOrder)
			.sort((x, y) => x - y);

		for (let round = 0; round < 10; round += 1) todos.swapTiedTodos(ctx(), ids[0], ids[2]);

		const after = todos
			.listTodos(ctx())
			.filter((t) => ids.includes(t.id))
			.map((t) => t.sortOrder)
			.sort((x, y) => x - y);
		expect(after).toEqual(before);
	});

	it('refuses two tasks the ratings already tell apart', () => {
		const a = todos.createTodo(ctx(), { title: 'urgent', ratings: { ...same, urgency: 5 } });
		const b = todos.createTodo(ctx(), { title: 'not so', ratings: same });
		expect(() => todos.swapTiedTodos(ctx(), a, b)).toThrow();
	});

	it("answers a stranger's task as if it did not exist", () => {
		const mine = todos.createTodo(ctx(), { title: 'mine', ratings: same });
		const theirs = todos.createTodo(ctx(STRANGER), { title: 'theirs', ratings: same });
		expect(() => todos.swapTiedTodos(ctx(), mine, theirs)).toThrow(/not found/i);
		expect(() => todos.swapTiedTodos(ctx(), mine, 999_999)).toThrow(/not found/i);
	});
});
