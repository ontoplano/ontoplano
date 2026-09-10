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
import { getTableConfig } from 'drizzle-orm/sqlite-core';
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
	test('walks every pointer before the table it points at', () => {
		// The demo's sweep found this the hard way: `workout_categories` was
		// listed before `workouts`, whose foreign key refuses the delete unless
		// the pointer goes first or its SET NULL action steps in. Read off the
		// schema, so a new foreign key cannot quietly break the walk: a pointer
		// with no delete action of its own must come before its target.
		const position = new Map(account.USER_TABLES.map((t, i) => [getTableConfig(t.table).name, i]));
		for (const t of account.USER_TABLES) {
			const config = getTableConfig(t.table);
			for (const fk of config.foreignKeys) {
				// SET NULL and CASCADE resolve the pointer themselves — and the
				// schema-parity test is what guarantees a shipped database
				// actually carries those actions.
				if (fk.onDelete === 'set null' || fk.onDelete === 'cascade') continue;
				const target = getTableConfig(fk.reference().foreignTable).name;
				const to = position.get(target);
				if (to === undefined) continue; // `user` and friends go after the walk
				// A table pointing at itself empties in one statement, and SQLite
				// only checks immediate foreign keys once the statement is done.
				if (target === config.name) continue;
				expect(
					position.get(config.name)!,
					`${config.name} points at ${target} but is deleted after it`
				).toBeLessThan(to);
			}
		}
	});

	test('takes everything of that account and nothing of the other', () => {
		const mine = todos.createTodo(ctx, { title: 'goes with me' });
		const theirTodo = todos.createTodo(theirs, { title: 'stays' });

		account.deleteAccount(OWNER);

		expect(todos.listTodos(ctx).some((t) => t.id === mine)).toBe(false);
		expect(todos.listTodos(theirs).some((t) => t.id === theirTodo)).toBe(true);
	});

	/**
	 * The one row that must outlive the account. The settings action writes an
	 * `account_deleted` note before deleting, and the note used to be filed
	 * under the account — so the very deletion it announced erased it, and an
	 * instance never learned that somebody left on their own.
	 */
	test('leaves its own note behind, disowned, with the address in the detail', async () => {
		const audit = await import('../src/lib/server/services/audit');
		const leaver = 'leaving-on-their-own';
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'Leaver', 'leaver@test.invalid', 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`,
			leaver
		);

		// What the settings delete action does, in order.
		audit.record(leaver, 'account_deleted', { detail: { email: 'leaver@test.invalid' } });
		account.deleteAccount(leaver);

		const note = database.get(
			"select user_id, detail from audit_events where event = 'account_deleted' and detail like '%leaver%'"
		) as { user_id: string | null; detail: string } | undefined;
		expect(note, 'the deletion erased its own record').toBeTruthy();
		expect(note?.user_id).toBeNull();
		expect(note?.detail).toContain('leaver@test.invalid');

		// Only the note survives — the rest of the account's history goes.
		const rest = database.get(
			'select count(*) as n from audit_events where user_id = ?',
			leaver
		) as { n: number } | undefined;
		expect(rest?.n).toBe(0);
	});
});

describe("the phone widget's one screen", () => {
	test('answers with the day, its blocks and its tasks', () => {
		const board = today.getTodayBoard(theirs);

		expect(board.date).toBe('2026-08-17');
		expect(board.timezone).toBe('UTC');
		expect(Array.isArray(board.blocks)).toBe(true);
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

		const habit = today.getTodayBoard(theirs, { habits: true }).habits!.find((h) => h.id === id)!;
		expect(habit.done).toBe(true);
		expect(habit.streak).toBeGreaterThanOrEqual(1);
	});

	/**
	 * The phone widget sits on a lock screen, and its token was granted a
	 * sentence about the day's plan. Which habits somebody kept is not that, and
	 * it used to arrive anyway.
	 */
	test('keeps habits out of the day unless they were asked for', () => {
		const id = habits.createHabit(theirs, { name: 'water', type: 'good' });
		habits.logOccurrence(theirs, { habitId: id, date: '2026-08-17' });

		const plain = today.getTodayBoard(theirs);
		expect(plain.habits).toBeUndefined();
		// The rest of the day is still there — this narrows one thing, not the board.
		expect(plain.blocks).toBeDefined();
		expect(plain.tasks).toBeDefined();

		const named = today.getTodayBoard(theirs, { habits: true }).habits!.map((h) => h.name);
		expect(named).toContain('water');
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
