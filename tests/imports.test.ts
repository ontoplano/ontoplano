/**
 * Bringing a list in from Todoist or Google Tasks.
 *
 * Both files are somebody's real data, exported once and imported once, and an
 * importer that quietly drops half of it is worse than no importer — the person
 * only finds out weeks later, when the thing they were relying on is not there.
 *
 * So the cases here are the ones the two formats actually produce: commas and
 * newlines inside quoted fields, Todoist's comment rows and section headings,
 * its free-text dates that are not dates, and Google's completed tasks and
 * blank rows. Each one is either imported or reported; none is silently lost.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let imports: typeof import('../src/lib/server/services/imports');
let todos: typeof import('../src/lib/server/services/todos');
let notebooks: typeof import('../src/lib/server/services/notebooks');
let db: typeof import('../src/lib/server/db/index');
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	imports = await import('../src/lib/server/services/imports');
	todos = await import('../src/lib/server/services/todos');
	notebooks = await import('../src/lib/server/services/notebooks');
	db = await import('../src/lib/server/db/index');
	ctx = { userId: OWNER, now: new Date('2026-09-01T10:00:00Z'), tz: 'UTC' };
});

/** A Todoist export, in the shape their "export as CSV" writes it. */
const TODOIST = [
	'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE',
	'section,Groceries,,,,,,,,',
	'task,"Buy milk, bread and eggs",From the corner shop,4,1,,,2026-09-04,en,',
	'note,"Ask about the sourdough, they bake on Thursdays",,,,,,,,',
	'task,Water the plants,,1,1,,,every day,en,',
	'task,"Read ""The Dispossessed""","Two chapters,\nthen sleep",2,2,,,,en,',
	'task,,,,,,,,,',
	''
].join('\n');

/** Google Takeout's Tasks.json, trimmed to the fields it actually carries. */
const GOOGLE = JSON.stringify({
	items: [
		{
			title: 'Errands',
			items: [
				{
					title: 'Post the letter',
					notes: 'Second class',
					status: 'needsAction',
					due: '2026-09-07T00:00:00.000Z'
				},
				{ title: 'Renew the passport', status: 'completed', due: '2026-08-01T00:00:00.000Z' },
				{ title: '   ', status: 'needsAction' }
			]
		},
		{
			title: 'Reading',
			items: [{ title: 'Finish Book VIII', status: 'needsAction' }]
		}
	]
});

describe('reading a CSV a task manager wrote', () => {
	it('keeps a comma that is inside a quoted field', () => {
		const rows = imports.parseCsv('a,b\n"one, two",three\n');
		expect(rows[1]).toEqual(['one, two', 'three']);
	});

	it('keeps a newline that is inside one', () => {
		const rows = imports.parseCsv('a,b\n"line one\nline two",x\n');
		expect(rows[1][0]).toBe('line one\nline two');
	});

	it('reads a doubled quote as one quote', () => {
		const rows = imports.parseCsv('a\n"He said ""no"""\n');
		expect(rows[1][0]).toBe('He said "no"');
	});

	it('treats CRLF as one break, and drops blank lines', () => {
		const rows = imports.parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
		expect(rows).toEqual([
			['a', 'b'],
			['1', '2'],
			['3', '4']
		]);
	});
});

describe('a Todoist export', () => {
	it('is recognised without being told which it is', () => {
		expect(imports.detectSource(TODOIST)).toBe('todoist');
		expect(imports.detectSource(GOOGLE)).toBe('google-tasks');
		expect(imports.detectSource('hello')).toBeNull();
	});

	it('brings the tasks and leaves the section behind, saying so', () => {
		const { tasks, skipped } = imports.parseTodoistCsv(TODOIST);

		expect(tasks.map((t) => t.title)).toEqual([
			'Buy milk, bread and eggs',
			'Water the plants',
			'Read "The Dispossessed"'
		]);
		expect(skipped.join(' ')).toContain('Groceries');
	});

	it('attaches a comment to the task above it', () => {
		const { tasks } = imports.parseTodoistCsv(TODOIST);
		// The comment is usually where the actual instruction is.
		expect(tasks[0].notes).toContain('From the corner shop');
		expect(tasks[0].notes).toContain('sourdough');
	});

	it('reads a real date and refuses to guess at a repeat', () => {
		const { tasks } = imports.parseTodoistCsv(TODOIST);

		expect(tasks[0].dueDate).toBe('2026-09-04');
		// "every day" is a rule, not a date. Kept, so the count can mention it.
		expect(tasks[1].dueDate).toBeNull();
		expect(tasks[1].rawDate).toBe('every day');
	});

	it('refuses a file that is not one', () => {
		expect(() => imports.parseTodoistCsv('name,when\nsomething,today\n')).toThrow(/Todoist/);
	});
});

describe('a Google Tasks export', () => {
	it('flattens the lists and remembers which one each came from', () => {
		const { tasks } = imports.parseGoogleTasks(GOOGLE);

		expect(tasks.map((t) => t.title)).toContain('Post the letter');
		expect(tasks.find((t) => t.title === 'Finish Book VIII')!.list).toBe('Reading');
	});

	it('reads the date half of a due stamp and not the time', () => {
		const { tasks } = imports.parseGoogleTasks(GOOGLE);
		// Google stores a due date as midnight UTC; reading the time moves half
		// the world's tasks a day.
		expect(tasks.find((t) => t.title === 'Post the letter')!.dueDate).toBe('2026-09-07');
	});

	it('knows which are finished, and reports a blank row', () => {
		const { tasks, skipped } = imports.parseGoogleTasks(GOOGLE);

		expect(tasks.find((t) => t.title === 'Renew the passport')!.done).toBe(true);
		expect(skipped.join(' ')).toContain('no title');
	});

	it('says so when the file is not JSON, or is the wrong JSON', () => {
		expect(() => imports.parseGoogleTasks('TYPE,CONTENT')).toThrow(/not JSON/);
		expect(() => imports.parseGoogleTasks('{"nope":1}')).toThrow(/task lists/);
	});
});

describe('what the import writes', () => {
	it('puts everything in a notebook of its own, which is the undo', () => {
		const result = imports.importTasks(ctx, { text: TODOIST });

		expect(result.imported).toBe(3);
		const book = notebooks.listNotebooks(ctx).find((n) => n.title === result.notebook)!;
		expect(book).toBeTruthy();

		const brought = todos.listTodos(ctx).filter((t) => t.notebookId === book.id);
		expect(brought).toHaveLength(3);
	});

	it('says how many carried a date it could not read', () => {
		const result = imports.importTasks(ctx, { text: TODOIST, notebook: 'Second go' });
		// "every day" is one of the three.
		expect(result.datesDropped).toBe(1);
	});

	it('does not refuse a second import of the same thing', () => {
		// `createNotebook` rejects a duplicate title, which is right when
		// somebody types one and wrong when two projects are imported in a row.
		const first = imports.importTasks(ctx, { text: GOOGLE });
		const second = imports.importTasks(ctx, { text: GOOGLE });
		expect(second.notebook).not.toBe(first.notebook);
	});

	it('leaves finished tasks out unless they are asked for', () => {
		const without = imports.importTasks(ctx, { text: GOOGLE, notebook: 'Open only' });
		const withDone = imports.importTasks(ctx, {
			text: GOOGLE,
			notebook: 'Everything',
			includeDone: true
		});

		// A Todoist account of several years holds thousands of finished tasks,
		// and the board's Done column is not where somebody's first day goes.
		expect(withDone.imported).toBe(without.imported + 1);
	});

	it('is all of it or none of it', () => {
		/*
		 * The failure that matters: half a list arrives, and the person cannot
		 * tell which half without going back to the app they just left —
		 * importing again would duplicate everything that did land.
		 *
		 * The import writes through `db` inside a `db.transaction`, which only
		 * rolls back because better-sqlite3 is synchronous and drizzle runs
		 * BEGIN on the same connection. That is the assumption worth testing, so
		 * it is tested directly: the same two calls the import makes, with the
		 * second one refused.
		 */
		const todosBefore = todos.listTodos(ctx).length;
		const booksBefore = notebooks.listNotebooks(ctx).length;

		expect(() =>
			db.db.transaction(() => {
				const notebookId = notebooks.createNotebook(ctx, { title: 'Doomed import' });
				todos.createTodo(ctx, { title: 'this one lands first', notebookId });
				// A todo with no title is refused by the service, as any row the
				// importer mangled would be.
				todos.createTodo(ctx, { title: '', notebookId });
			})
		).toThrow();

		expect(todos.listTodos(ctx)).toHaveLength(todosBefore);
		expect(notebooks.listNotebooks(ctx)).toHaveLength(booksBefore);
	});

	it('refuses an empty paste and a file it does not know', () => {
		expect(() => imports.importTasks(ctx, { text: '   ' })).toThrow(/Nothing to import/);
		expect(() => imports.importTasks(ctx, { text: 'just some words' })).toThrow(/neither/);
	});
});
