/**
 * Taking your data out, taking your account away, and the one screen a phone
 * widget reads.
 *
 * The export is the promise the terms make — "you can take it with you" — so
 * the thing worth pinning is that it covers **every** table that belongs to an
 * account, and that a new table cannot quietly be left out of it. Deletion is
 * the same promise with the sign flipped: everything goes, and nothing of
 * somebody else's does.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let account: typeof import('../src/lib/server/services/account');
let today: typeof import('../src/lib/server/services/today');
let todos: typeof import('../src/lib/server/services/todos');
let habits: typeof import('../src/lib/server/services/habits');
let diary: typeof import('../src/lib/server/services/diary');
let tags: typeof import('../src/lib/server/tags');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	account = await import('../src/lib/server/services/account');
	today = await import('../src/lib/server/services/today');
	todos = await import('../src/lib/server/services/todos');
	habits = await import('../src/lib/server/services/habits');
	diary = await import('../src/lib/server/services/diary');
	tags = await import('../src/lib/server/tags');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('the export', () => {
	test('accounts for every table that belongs to an account', () => {
		// The one that matters, and it had never been asserted: eight tables
		// carried a user_id and were handled by neither the export nor the
		// deletion — recipes and the written reviews among them. A table added
		// to the schema and forgotten here is data somebody cannot take with
		// them, and nothing else in the app would ever notice.
		expect(account.unaccountedTables()).toEqual([]);
	});

	test('carries the things that were being left behind', () => {
		const recipes = ['recipes', 'recipeItems'];
		const listed = account.USER_TABLES.map((t) => t.name);
		for (const name of [...recipes, 'weeklyReviews', 'reminders', 'calendarFeeds', 'pricePoints'])
			expect(listed, `${name} is not exported`).toContain(name);
	});

	test('carries what was written', () => {
		diary.createEntry(ctx, { content: 'something worth keeping' });
		todos.createTodo(ctx, { title: 'something to do' });

		const dump = account.exportAccount(OWNER, ctx.now);
		const asText = JSON.stringify(dump);
		expect(asText).toContain('something worth keeping');
		expect(asText).toContain('something to do');
	});

	test("carries nothing of anybody else's", () => {
		todos.createTodo(theirs, { title: 'not yours' });
		expect(JSON.stringify(account.exportAccount(OWNER, ctx.now))).not.toContain('not yours');
	});

	test('is rationed per day', () => {
		const allowed = account.exportsAllowedFor(OWNER, ctx.now);
		expect(allowed).toBeGreaterThan(0);

		const allowance = account.exportAllowance(OWNER, ctx.now);
		expect(allowance.remaining).toBeLessThanOrEqual(allowed);
		expect(allowance.remaining).toBeGreaterThanOrEqual(0);
		// The tests above have already spent some of the window, so there is a
		// time to wait for and it is in the future.
		expect(new Date(allowance.nextAt!).getTime()).toBeGreaterThan(ctx.now.getTime());
	});

	test('says how long until the next one, in words rather than a timestamp', () => {
		const inThreeHours = new Date(ctx.now.getTime() + 3 * 60 * 60 * 1000).toISOString();
		expect(account.hoursUntil(inThreeHours, ctx.now)).toBe('in about 3 hours');
		expect(account.hoursUntil(new Date(ctx.now.getTime() + 60_000).toISOString(), ctx.now)).toBe(
			'in under an hour'
		);
		// A window that has already opened says so rather than counting down
		// past zero.
		expect(account.hoursUntil(new Date(ctx.now.getTime() - 60_000).toISOString(), ctx.now)).toBe(
			'now'
		);
	});
});

describe('deleting an account', () => {
	test('takes everything of that account and nothing of the other', () => {
		const mine = todos.createTodo(ctx, { title: 'goes with me' });
		const theirTodo = todos.createTodo(theirs, { title: 'stays' });

		account.deleteAccount(OWNER);

		expect(todos.listTodos(ctx).some((t) => t.id === mine)).toBe(false);
		expect(todos.listTodos(theirs).some((t) => t.id === theirTodo)).toBe(true);
	});
});

describe("the phone widget's one screen", () => {
	test('answers with the day, its blocks, its habits and its tasks', () => {
		const board = today.getTodayBoard(theirs);

		expect(board.date).toBe('2026-08-17');
		expect(board.timezone).toBe('UTC');
		expect(Array.isArray(board.blocks)).toBe(true);
		expect(Array.isArray(board.habits)).toBe(true);
		expect(Array.isArray(board.tasks)).toBe(true);
	});

	test("shows the day's tasks, and marks the ones carried over", () => {
		const carried = todos.createTodo(theirs, { title: 'left over from Friday' });
		todos.scheduleTodo(theirs, carried, '2026-08-14');

		const onTime = todos.createTodo(theirs, { title: 'for today' });
		todos.scheduleTodo(theirs, onTime, '2026-08-17');

		const board = today.getTodayBoard(theirs);
		const titles = board.tasks.map((t) => t.title);
		expect(titles).toContain('for today');
		expect(titles).toContain('left over from Friday');
		expect(board.tasks.find((t) => t.title === 'left over from Friday')!.overdue).toBe(true);
		expect(board.tasks.find((t) => t.title === 'for today')!.overdue).toBe(false);
	});

	test('says whether each habit is done today, and its streak', () => {
		const id = habits.createHabit(theirs, { name: 'water', type: 'good' });
		habits.logOccurrence(theirs, { habitId: id, date: '2026-08-17' });

		const habit = today.getTodayBoard(theirs).habits.find((h) => h.id === id)!;
		expect(habit.done).toBe(true);
		expect(habit.streak).toBeGreaterThanOrEqual(1);
	});
});

describe('tags, however they are typed', () => {
	test('come out the same from commas, spaces and hashes', () => {
		const wanted = ['tagfoo', 'tagbar'];
		expect(tags.parseTags('tagfoo, tagbar')).toEqual(wanted);
		expect(tags.parseTags('tagfoo tagbar')).toEqual(wanted);
		expect(tags.parseTags('#tagfoo #tagbar')).toEqual(wanted);
		expect(tags.parseTags('#tagfoo,  #tagbar')).toEqual(wanted);
	});

	test('are lowercased and deduplicated', () => {
		expect(tags.parseTags('Work work WORK')).toEqual(['work']);
	});

	test('drop the empties rather than storing a blank tag', () => {
		expect(tags.parseTags('  ,  , #')).toEqual([]);
		expect(tags.parseTags('')).toEqual([]);
	});
});
