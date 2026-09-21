/**
 * A note that is really a checklist, becoming the todos it describes.
 *
 * The parser is tested on its own in `src/lib/checklist.test.ts`; what is
 * tested here is what the note carries across with it — the notebook it was
 * filed under, whose account it lands in, and whether a box somebody had
 * already ticked arrives ticked rather than as work to do again.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let diary: typeof import('../src/lib/services/diary');
let notebooks: typeof import('../src/lib/services/notebooks');
let todos: typeof import('../src/lib/services/todos');
let noteTodos: typeof import('../src/lib/services/note-todos');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let book: number;

const LIST = [
	'things before the trip',
	'',
	'- [ ] ring the plumber',
	'  the boiler makes a noise after 9pm',
	'- [x] book the MOT',
	'- [ ] pack'
].join('\n');

beforeAll(async () => {
	diary = await import('../src/lib/services/diary');
	notebooks = await import('../src/lib/services/notebooks');
	todos = await import('../src/lib/services/todos');
	noteTodos = await import('../src/lib/services/note-todos');
	ctx = { userId: OWNER, now: new Date('2026-09-19T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	book = notebooks.createNotebook(ctx, { title: 'The trip' });
});

const noteOf = (content: string, notebookId: number | null = book) =>
	diary.createEntry(ctx, { content, title: 'Before the trip', notebookId });

const made = (ids: number[]) => {
	const all = new Map(todos.listTodos(ctx).map((one) => [one.id, one]));
	return ids.map((id) => all.get(id)!);
};

describe('making them', () => {
	test('one todo per checkbox, in the order the note had them', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST));
		expect(made(ids).map((one) => one.title)).toEqual(['ring the plumber', 'book the MOT', 'pack']);
	});

	test('what was written under one becomes its notes', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST));
		expect(made(ids)[0].notes).toBe('the boiler makes a noise after 9pm');
		expect(made(ids)[2].notes).toBeFalsy();
	});

	test('a box already ticked arrives done, not as work to do again', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST));
		expect(made(ids).map((one) => one.status)).toEqual(['todo', 'done', 'todo']);
		expect(made(ids)[1].completedAt).toBeTruthy();
	});

	test('each one is filed under the notebook the note was in', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST));
		expect(made(ids).every((one) => one.notebookId === book)).toBe(true);
	});

	test('a note filed under nothing makes todos filed under nothing', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf('- [ ] pack', null));
		expect(made(ids)[0].notebookId).toBeNull();
	});

	/*
	 * It used to be left exactly as it was, and that was the bug: the offer to
	 * make todos of a checklist is drawn wherever a `- [ ]` is, so it stood
	 * there over a list that had already been made. What the note keeps is its
	 * words; what it loses is the boxes, which become references to the tasks
	 * they became. See `tests/note-todo-references.test.ts`.
	 */
	test('keeps its writing, and points at what it became', () => {
		const id = noteOf(LIST);
		noteTodos.makeTodosFromEntry(ctx, id);
		const after = diary.getEntry(ctx, id).content;

		expect(after).toContain('things before the trip');
		expect(after).toContain('the boiler makes a noise after 9pm');
		expect(after).toMatch(/TASK:#\d+/);
		expect(after).not.toContain('- [ ]');
		expect(after).not.toContain('- [x]');
	});

	test('a note with no checkbox in it makes nothing', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf('the wall is 2.4m'));
		expect(ids).toEqual([]);
	});
});

describe('leaving some behind', () => {
	test('takes only the ones named, by their place in the note', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST), [0, 2]);
		expect(made(ids).map((one) => one.title)).toEqual(['ring the plumber', 'pack']);
	});

	test('an empty choice makes nothing rather than everything', () => {
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST), []);
		expect(ids).toEqual([]);
	});

	test('a position the note does not have is counted, not crashed on', () => {
		const out = noteTodos.makeTodosFromEntry(ctx, noteOf(LIST), [0, 99]);
		expect(out.ids).toHaveLength(1);
		expect(out.skipped).toBe(1);
	});
});

describe('whose note it is', () => {
	test('a stranger cannot make todos out of it', () => {
		const id = noteOf(LIST);
		expect(() => noteTodos.makeTodosFromEntry(theirs, id)).toThrow();
		expect(todos.listTodos(theirs)).toHaveLength(0);
	});
});

describe('a checkbox line long enough to be a paragraph', () => {
	test('is cut to a title, and the rest of it goes into the notes', () => {
		const long = 'a'.repeat(todos.MAX_TITLE_LENGTH) + ' and then some more of it';
		const { ids } = noteTodos.makeTodosFromEntry(ctx, noteOf(`- [ ] ${long}`));
		const one = made(ids)[0];
		expect(one.title).toHaveLength(todos.MAX_TITLE_LENGTH);
		expect(one.notes).toBe('and then some more of it');
	});
});
