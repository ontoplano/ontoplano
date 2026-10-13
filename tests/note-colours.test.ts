/**
 * A note's colour, and how a notebook's notes are laid out.
 *
 * The colour is written into an inline style, so the service is the place
 * that refuses anything that is not `#rrggbb`; an edit that says nothing about
 * it keeps it, because the diary's form has no colour field; and a stranger
 * recolouring somebody's note is told exactly what they would be told about a
 * note that does not exist.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let diary: typeof import('../src/lib/services/diary');
let notebooks: typeof import('../src/lib/services/notebooks');
let settings: typeof import('../src/lib/services/settings');
let NotFoundError: typeof import('../src/lib/services/errors').NotFoundError;
let ValidationError: typeof import('../src/lib/services/errors').ValidationError;
let owner: import('../src/lib/services/ctx').Ctx;
let stranger: import('../src/lib/services/ctx').Ctx;
let notebookId: number;

beforeAll(async () => {
	diary = await import('../src/lib/services/diary');
	notebooks = await import('../src/lib/services/notebooks');
	settings = await import('../src/lib/services/settings');
	({ NotFoundError, ValidationError } = await import('../src/lib/services/errors'));
	const { buildCtx } = await import('../src/lib/services/ctx');
	owner = buildCtx(OWNER, { tz: 'UTC' });
	stranger = buildCtx(STRANGER, { tz: 'UTC' });
	notebookId = notebooks.createNotebook(owner, { title: 'Lisbon' });
});

const colourOf = (id: number) => diary.getEntry(owner, id).color;

describe('a note in a colour', () => {
	test('is written with one, lower-cased, and listed with it', () => {
		const id = diary.createEntry(owner, { content: 'The flat', notebookId, color: '#1D4ED8' });
		expect(colourOf(id)).toBe('#1d4ed8');
		expect(notebooks.entriesOf(owner, notebookId).find((e) => e.id === id)?.color).toBe('#1d4ed8');
	});

	test('is plain when none is given, or an empty one', () => {
		expect(colourOf(diary.createEntry(owner, { content: 'Plain', notebookId }))).toBeNull();
		expect(colourOf(diary.createEntry(owner, { content: 'Blank', color: '' }))).toBeNull();
	});

	test('refuses what is not a colour, and writes nothing', () => {
		const before = notebooks.entriesOf(owner, notebookId).length;
		for (const bad of ['blue', '#12345', '#1234567', 'url(x)', '#zzzzzz'])
			expect(() => diary.createEntry(owner, { content: 'x', notebookId, color: bad })).toThrow(
				ValidationError
			);
		expect(notebooks.entriesOf(owner, notebookId)).toHaveLength(before);
	});

	test('keeps its colour through an edit that does not mention it, and loses it on request', () => {
		const id = diary.createEntry(owner, { content: 'Budget', notebookId, color: '#b45309' });
		diary.updateEntry(owner, id, { content: 'Budget, revised' });
		expect(colourOf(id)).toBe('#b45309');

		diary.updateEntry(owner, id, { content: 'Budget, revised', color: '#0f766e' });
		expect(colourOf(id)).toBe('#0f766e');

		expect(() => diary.updateEntry(owner, id, { content: 'Changed', color: 'red' })).toThrow(
			ValidationError
		);
		expect(diary.getEntry(owner, id).content).toBe('Budget, revised');

		diary.updateEntry(owner, id, { content: 'Budget, revised', color: '' });
		expect(colourOf(id)).toBeNull();
	});

	test('cannot be changed by a stranger, who is told it does not exist', () => {
		const id = diary.createEntry(owner, { content: 'Mine', notebookId, color: '#6d28d9' });
		const missing = () => diary.updateEntry(stranger, 999_999, { content: 'x', color: '#000000' });
		const theirs = () => diary.updateEntry(stranger, id, { content: 'x', color: '#000000' });
		expect(missing).toThrow(NotFoundError);
		expect(theirs).toThrow(NotFoundError);
		expect(() => diary.getEntry(stranger, id)).toThrow(NotFoundError);
		expect(colourOf(id)).toBe('#6d28d9');
	});
});

describe('list or cards', () => {
	test('is the list until chosen, per notebook and per reader', () => {
		const other = notebooks.createNotebook(owner, { title: 'Kitchen' });
		expect(settings.getNoteView(OWNER, notebookId)).toBe('list');

		settings.setNoteView(OWNER, notebookId, 'grid');
		expect(settings.getNoteView(OWNER, notebookId)).toBe('grid');
		expect(settings.getNoteView(OWNER, other)).toBe('list');
		expect(settings.getNoteView(STRANGER, notebookId)).toBe('list');

		// Twice is still once, and back to the list takes it off.
		settings.setNoteView(OWNER, notebookId, 'grid');
		settings.setNoteView(OWNER, notebookId, 'list');
		expect(settings.getNoteView(OWNER, notebookId)).toBe('list');
		expect(settings.getUserSetting(OWNER, settings.NOTE_GRID_KEY)).toBe('[]');
	});

	test('refuses a view or a notebook it does not know', () => {
		expect(() => settings.setNoteView(OWNER, notebookId, 'masonry')).toThrow(ValidationError);
		expect(() => settings.setNoteView(OWNER, 'abc', 'grid')).toThrow(ValidationError);
		expect(settings.getNoteView(OWNER, null)).toBe('list');
	});

	test('reads a damaged setting as nothing chosen', () => {
		settings.setUserSetting(OWNER, settings.NOTE_GRID_KEY, '{not json');
		expect(settings.getNoteView(OWNER, notebookId)).toBe('list');
	});
});
