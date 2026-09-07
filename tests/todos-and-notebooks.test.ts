/**
 * Todos, and the notebooks things belong to.
 *
 * A todo has no day until it is given one, and giving it one is the seam where
 * the list and the calendar meet: promoting it must produce a block *and* stop
 * it appearing as unscheduled, or the same task is on screen twice. Deleting a
 * notebook is the opposite promise — the notebook goes and everything that
 * pointed at it stays, because those are the person's own writing and tasks.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let todos: typeof import('../src/lib/server/services/todos');
let notebooks: typeof import('../src/lib/server/services/notebooks');
let diary: typeof import('../src/lib/server/services/diary');
let activities: typeof import('../src/lib/server/services/activities');
let slots: typeof import('../src/lib/server/services/slots');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

beforeAll(async () => {
	todos = await import('../src/lib/server/services/todos');
	notebooks = await import('../src/lib/server/services/notebooks');
	diary = await import('../src/lib/server/services/diary');
	activities = await import('../src/lib/server/services/activities');
	slots = await import('../src/lib/server/services/slots');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
});

describe('a todo', () => {
	test('starts with no day on it', () => {
		const id = todos.createTodo(ctx, { title: 'buy a bigger pan' });
		expect(todos.listUnscheduled(ctx).some((t) => t.id === id)).toBe(true);
		expect(todos.listTodos(ctx).find((t) => t.id === id)!.scheduledDate).toBeFalsy();
	});

	test('refuses an empty title', () => {
		expect(() => todos.createTodo(ctx, { title: '   ' })).toThrow();
	});

	test('can be given a day, and then answers for that day', () => {
		const id = todos.createTodo(ctx, { title: 'ring the plumber' });
		todos.scheduleTodo(ctx, id, '2026-08-18');

		expect(todos.listForDate(ctx, '2026-08-18').some((t) => t.id === id)).toBe(true);
		// And it is no longer waiting in the undated rail.
		expect(todos.listUnscheduled(ctx).some((t) => t.id === id)).toBe(false);
	});

	test('is marked done and comes back open', () => {
		const id = todos.createTodo(ctx, { title: 'return the drill' });
		todos.setTodoStatus(ctx, id, 'done');
		expect(todos.listTodos(ctx).find((t) => t.id === id)!.status).toBe('done');

		todos.setTodoStatus(ctx, id, 'todo');
		expect(todos.listTodos(ctx).find((t) => t.id === id)!.status).toBe('todo');
	});

	test('refuses a status that is not one', () => {
		const id = todos.createTodo(ctx, { title: 'x' });
		expect(() => todos.setTodoStatus(ctx, id, 'nearly')).toThrow();
	});

	test('carries the three ratings, when they are set', () => {
		const id = todos.createTodo(ctx, { title: 'sort the cables' });
		todos.setTodoRatings(ctx, id, { urgency: 2, interest: 4 });

		const todo = todos.listTodos(ctx).find((t) => t.id === id)!;
		expect(todo.ratings.urgency).toBe(2);
		expect(todo.ratings.interest).toBe(4);
		// Unset stays unset rather than becoming a zero, which would read as
		// "rated lowest" instead of "not rated".
		expect(todo.ratings.energy).toBeNull();
	});

	test('can be reordered, and the order sticks', () => {
		const a = todos.createTodo(ctx, { title: 'first' });
		const b = todos.createTodo(ctx, { title: 'second' });

		todos.reorderTodos(ctx, [b, a]);
		const order = todos
			.listUnscheduled(ctx)
			.filter((t) => t.id === a || t.id === b)
			.map((t) => t.id);
		expect(order).toEqual([b, a]);
	});

	test('belongs to one account', () => {
		const mine = todos.listTodos(ctx)[0];
		expect(() => todos.updateTodo(theirs, mine.id, { title: 'taken' })).toThrow();
		expect(() => todos.deleteTodo(theirs, mine.id)).toThrow();
		expect(todos.listTodos(theirs)).toHaveLength(0);
	});
});

describe('putting a todo on the calendar', () => {
	test('makes a block for it and takes it out of the undated rail', () => {
		const id = todos.createTodo(ctx, { title: 'write the letter', categoryId: work });

		const result = todos.promoteTodo(ctx, {
			todoId: id,
			date: '2026-08-19',
			startTime: '10:00',
			durationMinutes: 45
		});

		expect(result.ok).toBe(true);
		// The same task on screen twice is the failure this prevents.
		expect(todos.listUnscheduled(ctx).some((t) => t.id === id)).toBe(false);
	});

	test('says so rather than throwing when the todo is not there', () => {
		const result = todos.promoteTodo(ctx, {
			todoId: 999_999,
			date: '2026-08-19',
			startTime: '10:00'
		});
		expect(result.ok).toBe(false);
	});

	/**
	 * And back off it again.
	 *
	 * Scheduling used to be one-way: a todo dragged onto Tuesday at nine stopped
	 * being a todo, and changing your mind meant deleting the block and typing
	 * the task in again. A week you cannot back out of is one people stop
	 * planning, so the round trip is the thing worth pinning.
	 */
	test('and back off it, with what a todo can hold intact', () => {
		const notebook = notebooks.createNotebook(ctx, { title: 'Correspondence' });
		const id = todos.createTodo(ctx, {
			title: 'post the letter',
			notes: 'second class is fine',
			categoryId: work,
			notebookId: notebook,
			ratings: { urgency: 4, interest: null, energy: null }
		});
		todos.promoteTodo(ctx, { todoId: id, date: '2026-08-19', startTime: '11:00' });

		const block = slots
			.listExceptionals(ctx, '2026-08-19', '2026-08-20')
			.find((e) => e.label === 'post the letter')!;
		expect(block).toBeTruthy();

		const { todoId } = todos.demoteToTodo(ctx, block.id);

		const back = todos.listUnscheduled(ctx).find((t) => t.id === todoId)!;
		expect(back.title).toBe('post the letter');
		expect(back.notes).toBe('second class is fine');
		expect(back.categoryId).toBe(work);
		expect(back.notebookId).toBe(notebook);
		expect(back.ratings.urgency).toBe(4);
		// The block is gone, rather than the task existing in both places.
		expect(
			slots.listExceptionals(ctx, '2026-08-19', '2026-08-20').some((e) => e.id === block.id)
		).toBe(false);
	});

	test('taking a block off the day is refused for somebody else', () => {
		const id = todos.createTodo(ctx, { title: 'mine alone', categoryId: work });
		todos.promoteTodo(ctx, { todoId: id, date: '2026-08-20', startTime: '09:00' });
		const block = slots
			.listExceptionals(ctx, '2026-08-20', '2026-08-21')
			.find((e) => e.label === 'mine alone')!;

		expect(() => todos.demoteToTodo(theirs, block.id)).toThrow();
	});

	test('delegating one to a block refuses a time that is not one', () => {
		const id = todos.createTodo(ctx, { title: 'call the bank' });
		expect(() =>
			todos.delegateTodo(ctx, id, {
				date: '2026-08-19',
				startTime: '99:99',
				mode: 'category',
				categoryId: work
			})
		).toThrow();
	});
});

describe('notebooks', () => {
	test('hold notes and tasks, and count what is in them', () => {
		const id = notebooks.createNotebook(ctx, {
			title: 'Kitchen',
			description: 'quotes and measurements'
		});

		diary.createEntry(ctx, { content: 'the plumber says the wall can go', notebookId: id });
		todos.createTodo(ctx, { title: 'measure the wall', notebookId: id });

		const contents = notebooks.contentsOf(ctx, id);
		expect(contents.entries).toHaveLength(1);
		expect(contents.todos).toHaveLength(1);
	});

	test('can be closed when they are over, and reopened', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Bathroom leak' });

		notebooks.setNotebookClosed(ctx, id, true);
		expect(notebooks.getNotebook(ctx, id).closedAt).toBeTruthy();

		notebooks.setNotebookClosed(ctx, id, false);
		expect(notebooks.getNotebook(ctx, id).closedAt).toBeFalsy();
	});

	test('refuse a second notebook by the same name', () => {
		expect(() => notebooks.createNotebook(ctx, { title: 'Kitchen' })).toThrow();
	});

	test('deleting one leaves the writing and the tasks where they are', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Temporary' });
		const entry = diary.createEntry(ctx, { content: 'a note in a doomed book', notebookId: id });
		const todo = todos.createTodo(ctx, { title: 'a task in a doomed book', notebookId: id });

		notebooks.deleteNotebook(ctx, id);

		expect(notebooks.listNotebooks(ctx).some((n) => n.id === id)).toBe(false);
		expect(todos.listTodos(ctx).some((t) => t.id === todo)).toBe(true);

		// The note is kept, and it is kept OUT of the journal: it was written
		// about a subject rather than about a day, and dropping it back into the
		// diary would rewrite the account's history. It has its own section.
		expect(notebooks.listOrphanedNotes(ctx).some((e) => e.id === entry)).toBe(true);
		expect(diary.listEntries(ctx).some((e) => e.id === entry)).toBe(false);
	});

	test("are not another account's to read or change", () => {
		const mine = notebooks.listNotebooks(ctx)[0];
		expect(() => notebooks.getNotebook(theirs, mine.id)).toThrow();
		expect(() => notebooks.updateNotebook(theirs, mine.id, { title: 'taken' })).toThrow();
		expect(() => notebooks.deleteNotebook(theirs, mine.id)).toThrow();
	});

	test('a notebook id from elsewhere is refused rather than accepted', () => {
		// This is the guard every "belongs to" field leans on.
		const mine = notebooks.listNotebooks(ctx)[0];
		expect(notebooks.ownedNotebookId(ctx, mine.id)).toBe(mine.id);
		expect(notebooks.ownedNotebookId(ctx, '')).toBeNull();
		expect(() => notebooks.ownedNotebookId(theirs, mine.id)).toThrow();
	});
});

/**
 * A birthday on a card, written the way somebody says it.
 *
 * It is stored as it was given — `1990-03-14`, or `--03-14` where the year is
 * not known — and a card showing "--01-08" is showing a string rather than a
 * birthday.
 */
describe('a birthday, as a card shows it', () => {
	test('reads as a date, with or without the year behind it', async () => {
		const { birthdayLabel } = await import('../src/lib/people');
		expect(birthdayLabel('1990-03-14')).toBe('Mar 14');
		expect(birthdayLabel('--01-08')).toBe('Jan 8');
		expect(birthdayLabel('2001-12-01')).toBe('Dec 1');
	});

	test('and says nothing at all when there is nothing to say', async () => {
		const { birthdayLabel } = await import('../src/lib/people');
		expect(birthdayLabel(null)).toBeNull();
		expect(birthdayLabel('')).toBeNull();
		expect(birthdayLabel('not a date')).toBeNull();
	});
});
