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

let todos: typeof import('../src/lib/services/todos');
let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let activities: typeof import('../src/lib/services/activities');
let slots: typeof import('../src/lib/services/slots');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

beforeAll(async () => {
	todos = await import('../src/lib/services/todos');
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	activities = await import('../src/lib/services/activities');
	slots = await import('../src/lib/services/slots');
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
		expect(todo.ratings.ease).toBeNull();
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
			ratings: { urgency: 4, interest: null, ease: null }
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

	/*
	 * Putting a task on a day is the same act as making a block, and a block
	 * has always been able to ask for a reminder — so the one dialog that
	 * could not was the one people reach for when they think "do this on
	 * Thursday", which is exactly when they want telling.
	 */
	test('delegating one can ask to be reminded, and nought means not at all', () => {
		const withNudge = todos.createTodo(ctx, { title: 'ring the plumber' });
		todos.delegateTodo(ctx, withNudge, {
			date: '2026-08-19',
			startTime: '09:00',
			mode: 'category',
			categoryId: work,
			remindLeadMinutes: 30
		});

		const quiet = todos.createTodo(ctx, { title: 'water the plants' });
		todos.delegateTodo(ctx, quiet, {
			date: '2026-08-19',
			startTime: '10:00',
			mode: 'category',
			categoryId: work,
			remindLeadMinutes: 0
		});

		const onTheDay = slots.listExceptionals(ctx, '2026-08-19', '2026-08-20');
		expect(onTheDay.find((one) => one.label === 'ring the plumber')?.remindLeadMinutes).toBe(30);
		// Nought and "never asked" are the same answer and are stored alike.
		expect(onTheDay.find((one) => one.label === 'water the plants')?.remindLeadMinutes).toBeNull();
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

/**
 * A note has a name, and a list of them is names.
 *
 * A notebook is a subject somebody comes back to for months; a column of full
 * notes is a wall, and finding the one you meant is what the list is for. The
 * name is optional because a note jotted in a hurry should not be held up by
 * a form asking what to call it — the screen falls back to the first line.
 */
describe('a note is called something', () => {
	test('keeps the name it was given, and lets it be changed', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Named notes A' });
		const note = diary.createEntry(ctx, {
			title: 'Three quotes in',
			content: 'All three agree the pipes have to move.',
			notebookId: id
		});

		const named = () => notebooks.contentsOf(ctx, id).entries.find((e) => e.id === note)!;
		expect(named()).toMatchObject({ title: 'Three quotes in' });

		diary.updateEntry(ctx, note, { title: 'Four quotes in', content: 'And a fourth.' });
		expect(named().title).toBe('Four quotes in');
	});

	test('is nameless when nobody named it, rather than refusing', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Named notes B' });
		const note = diary.createEntry(ctx, { content: 'a line with no name', notebookId: id });
		expect(notebooks.contentsOf(ctx, id).entries.find((e) => e.id === note)!.title).toBe('');
	});

	test('an edit that mentions neither keeps the note where it is, with its name', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Named notes C' });
		const note = diary.createEntry(ctx, {
			title: 'Book I',
			content: 'On justice.',
			notebookId: id
		});

		// The diary's own edit form has no title field; it must not erase one.
		diary.updateEntry(ctx, note, { content: 'On justice, again.' });
		expect(notebooks.contentsOf(ctx, id).entries.find((e) => e.id === note)!.title).toBe('Book I');
	});
});

/**
 * Notebooks belong to each other, by name.
 *
 * The same em dash the gallery's albums use: `Renovation — Kitchen` sits
 * inside `Renovation`. No parent column to keep in step, and renaming one to
 * `Renovation — Bathroom` moves it, which is what typing that plainly means.
 */
describe('notebooks as folders', () => {
	test('a name with a dash in it hangs off the one before it', () => {
		notebooks.createNotebook(ctx, { title: 'Renovation' });
		notebooks.createNotebook(ctx, { title: 'Renovation — Kitchen' });
		notebooks.createNotebook(ctx, { title: 'Renovation — Bathroom' });

		const root = notebooks.notebookTree(ctx).find((n) => n.title === 'Renovation')!;
		expect(root.depth).toBe(0);
		expect(root.children.map((c) => c.title).sort()).toEqual([
			'Renovation — Bathroom',
			'Renovation — Kitchen'
		]);
		expect(root.children[0].depth).toBe(1);
	});

	test('hangs off the nearest ancestor that exists, not off nothing', () => {
		notebooks.createNotebook(ctx, { title: 'Trip' });
		// No `Trip — 2026`: the grandchild still belongs under Trip.
		notebooks.createNotebook(ctx, { title: 'Trip — 2026 — Lisbon' });

		const trip = notebooks.notebookTree(ctx).find((n) => n.title === 'Trip')!;
		expect(trip.children.map((c) => c.title)).toEqual(['Trip — 2026 — Lisbon']);
	});

	test('a folder counts what is under it, not only its own', () => {
		const parent = notebooks.createNotebook(ctx, { title: 'Reading list' });
		const child = notebooks.createNotebook(ctx, { title: 'Reading list — Philosophy' });
		diary.createEntry(ctx, { content: 'one', notebookId: parent });
		diary.createEntry(ctx, { content: 'two', notebookId: child });
		diary.createEntry(ctx, { content: 'three', notebookId: child });

		const root = notebooks.notebookTree(ctx).find((n) => n.title === 'Reading list')!;
		expect(root.entries).toBe(1);
		expect(root.totals?.notes).toBe(3);
	});
});

/**
 * Put away, which is neither done nor gone.
 *
 * A task somebody is not going to look at for a while and is not willing to
 * delete. Its own column rather than a fifth status, because archived and
 * unfinished are answers to different questions — and coming back to it has to
 * find it exactly as it was, which a status could not promise.
 */
describe('archiving a todo', () => {
	test('puts it away without finishing it, and brings it back unchanged', () => {
		const id = todos.createTodo(ctx, { title: 'the tax thing', notes: 'later' });
		todos.setTodoStatus(ctx, id, 'doing');

		todos.archiveTodo(ctx, id);
		const away = todos.listTodos(ctx).find((t) => t.id === id)!;
		expect(away.archivedAt).not.toBeNull();
		// Still exactly what it was: not finished, and everything about it kept.
		expect(away.status).toBe('doing');
		expect(away.notes).toBe('later');

		todos.archiveTodo(ctx, id, false);
		const back = todos.listTodos(ctx).find((t) => t.id === id)!;
		expect(back.archivedAt).toBeNull();
		expect(back.status).toBe('doing');
	});

	test("is nobody else's to put away", () => {
		const id = todos.createTodo(ctx, { title: 'mine' });
		expect(() => todos.archiveTodo(theirs, id)).toThrow();
		expect(todos.listTodos(ctx).find((t) => t.id === id)!.archivedAt).toBeNull();
	});
});

/**
 * The same idea for a note: hidden, and still there.
 *
 * A notebook kept for a year holds notes that have stopped being current and
 * are still not things to delete — the trip is over, the argument is settled.
 */
describe('archiving a note', () => {
	test('hides it from the notebook and brings it back unchanged', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Lisbon' });
		const id = diary.createEntry(ctx, {
			content: 'where to eat',
			title: 'Restaurants',
			tags: 'food',
			notebookId: book
		});

		diary.archiveEntry(ctx, id);
		const away = notebooks.contentsOf(ctx, book).entries.find((e) => e.id === id)!;
		expect(away.archivedAt).not.toBeNull();
		// Still in its notebook, with everything it carried.
		expect(away.title).toBe('Restaurants');
		expect(away.tags.map((t) => t.name)).toEqual(['food']);

		diary.archiveEntry(ctx, id, false);
		expect(notebooks.contentsOf(ctx, book).entries.find((e) => e.id === id)!.archivedAt).toBeNull();
	});

	test("is nobody else's to put away", () => {
		const book = notebooks.createNotebook(ctx, { title: 'Only mine' });
		const id = diary.createEntry(ctx, { content: 'private', notebookId: book });
		expect(() => diary.archiveEntry(theirs, id)).toThrow();
		expect(notebooks.contentsOf(ctx, book).entries[0].archivedAt).toBeNull();
	});
});

/**
 * A notebook's Tasks tab is the to-do room looking at one subject, so it needs
 * the whole todo rather than a title and a status.
 */
describe("a notebook's tasks", () => {
	test('come back as full todos, and only that notebook’s', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Kitchen tasks' });
		const mine = todos.createTodo(ctx, {
			title: 'measure the wall',
			notes: 'the long one',
			notebookId: book
		});
		todos.createTodo(ctx, { title: 'unrelated' });

		const found = notebooks.contentsOf(ctx, book).todos;
		expect(found.map((t) => t.id)).toEqual([mine]);
		expect(found[0]).toMatchObject({ notes: 'the long one', archivedAt: null });
		expect(found[0].ratings).toEqual({ urgency: null, interest: null, ease: null });
	});
});

/**
 * The two or three notes a notebook is actually for.
 *
 * A notebook reads oldest first, because it is a subject being worked through
 * — and that is exactly wrong for the note you come back to every time you
 * open it: the measurements, the account number. Pinned ones sit above the
 * rest, as many as somebody likes, newest pin first.
 */
describe('a pinned note', () => {
	let book: number;
	let first: number;
	let second: number;
	let third: number;

	beforeAll(() => {
		book = notebooks.createNotebook(ctx, { title: 'The kitchen' });
		first = diary.createEntry(ctx, { content: 'the plumber comes Tuesday', notebookId: book });
		second = diary.createEntry(ctx, { content: 'worktop is 2.4m', notebookId: book });
		third = diary.createEntry(ctx, { content: 'the tiles are 15cm', notebookId: book });
	});

	const order = () => notebooks.contentsOf(ctx, book).entries.map((e) => e.id);

	test('is read oldest first until something is pinned', () => {
		expect(order()).toEqual([first, second, third]);
	});

	test('rises to the top, and the newest pin leads', () => {
		diary.pinEntry(ctx, second);
		expect(order()).toEqual([second, first, third]);

		// A minute later, because the order among pinned notes is the order they
		// were pinned in — and a frozen clock pins everything at once.
		diary.pinEntry({ ...ctx, now: new Date(ctx.now.getTime() + 60_000) }, third);
		expect(order()).toEqual([third, second, first]);
	});

	test('and falls back into place when it is let go', () => {
		diary.pinEntry(ctx, third, false);
		expect(order()).toEqual([second, first, third]);
	});

	test('is nobody else’s to pin', () => {
		expect(() => diary.pinEntry(theirs, first)).toThrow();
	});
});
