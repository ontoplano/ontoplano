/**
 * A note that became a list of tasks points at them afterwards.
 *
 * Making todos of a note's checkboxes left the boxes where they were, so the
 * offer to do it stood over a list that had already been made — press it twice
 * and the tasks exist twice — and the note and the list were two records of
 * one thing, free to drift. Each line that crossed over is a reference now:
 * `TASK:#4`, the task's number inside this notebook.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { render } from 'svelte/server';
import TranslatedMarkdownBox from './helpers/TranslatedMarkdownBox.svelte';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let todos: typeof import('../src/lib/services/todos');
let noteTodos: typeof import('../src/lib/services/note-todos');
let checklist: typeof import('../src/lib/checklist');
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	todos = await import('../src/lib/services/todos');
	noteTodos = await import('../src/lib/services/note-todos');
	checklist = await import('../src/lib/checklist');
	ctx = { userId: OWNER, now: new Date('2026-09-20T09:00:00'), tz: 'UTC' };
});

describe('a task inside a notebook', () => {
	test('is numbered from one, in the order they are written', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Numbering' });
		const first = todos.createTodo(ctx, { title: 'first', notebookId: book });
		const second = todos.createTodo(ctx, { title: 'second', notebookId: book });

		expect(todos.getTodo(ctx, first).notebookSeq).toBe(1);
		expect(todos.getTodo(ctx, second).notebookSeq).toBe(2);
	});

	test('keeps its number when it is edited, and gains one when it is filed', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Filing' });
		const loose = todos.createTodo(ctx, { title: 'nowhere yet' });
		expect(todos.getTodo(ctx, loose).notebookSeq).toBeNull();

		todos.updateTodo(ctx, loose, { title: 'nowhere yet', notebookId: book });
		const given = todos.getTodo(ctx, loose).notebookSeq;
		expect(given).toBe(1);

		// Editing it again must not change what a note already points at.
		todos.updateTodo(ctx, loose, { title: 'renamed', notebookId: book });
		expect(todos.getTodo(ctx, loose).notebookSeq).toBe(given);
	});

	test('a number is never handed to a second task', () => {
		const book = notebooks.createNotebook(ctx, { title: 'High water' });
		const first = todos.createTodo(ctx, { title: 'first', notebookId: book });
		todos.deleteTodo(ctx, first);
		const next = todos.createTodo(ctx, { title: 'second', notebookId: book });
		// Not 1: `TASK:#1` written in a note must not come to mean this one.
		expect(todos.getTodo(ctx, next).notebookSeq).toBe(2);
	});
});

describe('making todos of a checklist', () => {
	test('replaces each box with a reference to the task it became', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Kitchen' });
		const note = diary.createEntry(ctx, {
			content: 'Before the work starts:\n\n- [ ] ring the plumber\n  after 9pm\n- [x] book the MOT',
			notebookId: book
		});

		const made = noteTodos.makeTodosFromEntry(ctx, note);
		expect(made.ids).toHaveLength(2);

		const after = diary.getEntry(ctx, note).content;
		// The boxes are gone, so the offer no longer stands over a list that
		// has already been made.
		expect(checklist.checklistItems(after)).toHaveLength(0);
		expect(after).toContain('TASK:#1');
		expect(after).toContain('TASK:#2');
		// And the writing under a line is still under it.
		expect(after).toContain('after 9pm');
		expect(after).toContain('Before the work starts:');
	});

	test('leaves the boxes alone where there is no notebook to be numbered in', () => {
		const note = diary.createEntry(ctx, { content: '- [ ] loose end' });
		noteTodos.makeTodosFromEntry(ctx, note);
		// Nothing to point at, so nothing is rewritten.
		expect(diary.getEntry(ctx, note).content).toContain('- [ ] loose end');
	});

	test('a box left behind keeps its box', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Partly' });
		const note = diary.createEntry(ctx, {
			content: '- [ ] taken\n- [ ] left behind',
			notebookId: book
		});
		noteTodos.makeTodosFromEntry(ctx, note, [0]);

		const after = diary.getEntry(ctx, note).content;
		expect(after).toContain('TASK:#1');
		expect(after).toContain('- [ ] left behind');
	});
});

describe('the reference, rendered', () => {
	test('is the task it names, with a tick when it is done', async () => {
		const { renderMarkdown } = await import('../src/lib/markdown');
		const refs = new Map([
			[4, { title: 'ring the plumber', done: false }],
			[5, { title: 'book the MOT', done: true }]
		]);

		const html = renderMarkdown('- TASK:#4\n- TASK:#5', refs);
		expect(html).toContain('ring the plumber');
		expect(html).toContain('data-todo-seq="4"');
		expect(html).toContain('is-done');
		expect(html).toContain('✓ book the MOT');
	});

	test('is still a link where the caller has no list', async () => {
		const { renderMarkdown } = await import('../src/lib/markdown');
		const html = renderMarkdown('see TASK:#7');
		expect(html).toContain('data-todo-seq="7"');
		expect(html).toContain('TASK:#7');
	});

	/*
	 * The reference was spelled `TODO:#` before the room was renamed, and
	 * notes written then still say it. A rename that stopped reading the old
	 * spelling would blank a reference in writing somebody already has.
	 */
	test('reads the older TODO: spelling in writing that already exists', async () => {
		const { renderMarkdown } = await import('../src/lib/markdown');
		const refs = new Map([[4, { title: 'ring the plumber', done: false }]]);

		const html = renderMarkdown('- TODO:#4', refs);
		expect(html).toContain('ring the plumber');
		expect(html).toContain('data-todo-seq="4"');
		expect(html).not.toContain('TODO:#4');
	});

	test('escapes a title, like everything else here', async () => {
		const { renderMarkdown } = await import('../src/lib/markdown');
		const html = renderMarkdown('TASK:#1', new Map([[1, { title: '<script>x', done: false }]]));
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});

/*
 * The preview beside the box draws the note that is being typed, so it has to
 * resolve a reference the same way the saved note does. It was called with no
 * list at all, so a chip that read as the task's title once saved read as
 * `TASK:#4` while it was being written.
 */
describe('the reference in the preview', () => {
	const refs = new Map([[4, { title: 'ring the plumber', done: true }]]);
	const preview = (value: string, todos?: typeof refs) =>
		render(TranslatedMarkdownBox, { props: { value, todos } }).body;

	test('is the task it names, where the notebook handed its list over', () => {
		const html = preview('see TASK:#4', refs);
		expect(html).toContain('✓ ring the plumber');
		expect(html).toContain('data-todo-seq="4"');
	});

	test('reads the older TODO: spelling too', () => {
		expect(preview('see TODO:#4', refs)).toContain('✓ ring the plumber');
	});

	test('is still a chip where there is no notebook — the diary, the wheel', () => {
		const html = preview('see TASK:#4');
		expect(html).toContain('TASK:#4');
		expect(html).not.toContain('ring the plumber');
	});
});
