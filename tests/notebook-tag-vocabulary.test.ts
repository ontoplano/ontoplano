/**
 * A tag field with a notebook chosen offers that notebook's words.
 *
 * The words are the ones on the notes, tasks and ideas filed in it, plus the
 * labels it hands a new note — and only ever this account's own.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let tags: typeof import('../src/lib/services/tags');
let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let todos: typeof import('../src/lib/services/todos');
let ideas: typeof import('../src/lib/services/ideas');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

beforeAll(async () => {
	tags = await import('../src/lib/services/tags');
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	todos = await import('../src/lib/services/todos');
	ideas = await import('../src/lib/services/ideas');
	({ buildCtx } = await import('../src/lib/services/ctx'));
});

describe('the words a notebook uses', () => {
	test('what is filed in it, and what it lends a new note — nothing from elsewhere', () => {
		const ctx = buildCtx(OWNER, { tz: 'UTC' });
		const kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen', defaultTags: 'renovation' });
		const garden = notebooks.createNotebook(ctx, { title: 'Garden' });

		todos.createTodo(ctx, { title: 'Order tiles', notebookId: kitchen, tags: 'tiles, budget' });
		diary.createEntry(ctx, { content: 'Measured.', notebookId: kitchen, tags: 'measurements' });
		ideas.createIdea(ctx, { content: 'Open shelves', notebookId: kitchen, tags: 'shelving' });
		todos.createTodo(ctx, { title: 'Prune', notebookId: garden, tags: 'roses' });
		todos.createTodo(ctx, { title: 'Loose', tags: 'errand' });

		expect(tags.notebookTags(OWNER, kitchen)).toEqual([
			'budget',
			'measurements',
			'renovation',
			'shelving',
			'tiles'
		]);
		expect(tags.notebookTags(OWNER, garden)).toEqual(['roses']);
		// A word used only outside every notebook is in no notebook's list.
		expect(Object.values(tags.tagsByNotebook(OWNER)).flat()).not.toContain('errand');
	});

	test("a stranger's notebook gives nothing, and theirs never leak into mine", () => {
		const theirs = buildCtx(STRANGER, { tz: 'UTC' });
		const private_ = notebooks.createNotebook(theirs, {
			title: 'Private',
			defaultTags: 'secret'
		});
		todos.createTodo(theirs, { title: 'Hidden', notebookId: private_, tags: 'classified' });

		expect(tags.notebookTags(OWNER, private_)).toEqual([]);
		expect(tags.tagsByNotebook(OWNER)[private_]).toBeUndefined();
		expect(Object.values(tags.tagsByNotebook(OWNER)).flat()).not.toContain('classified');
		// The owner still sees their own.
		expect(tags.notebookTags(STRANGER, private_)).toEqual(['classified', 'secret']);
		// And the stranger's map carries none of mine.
		expect(Object.values(tags.tagsByNotebook(STRANGER)).flat()).not.toContain('tiles');
	});
});
