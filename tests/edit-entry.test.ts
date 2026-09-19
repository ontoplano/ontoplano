/**
 * Changing what a note says, over the API.
 *
 * The tools could make a note and put one away and nothing in between, so the
 * only way to correct one was to write a second and hide the first. Asked to
 * turn a note into todos and then tidy the note, an assistant could do neither
 * half.
 *
 * The rule that costs the most if it is wrong is the same one the todo tags
 * have: a field left out keeps what it had. An edit meaning to fix a typo in
 * the title must not empty the tags, and must not move the note out of its
 * notebook — which is exactly what `undefined` read as before anybody looked.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let diary: typeof import('../src/lib/services/diary');
let notebooks: typeof import('../src/lib/services/notebooks');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let book: number;

beforeAll(async () => {
	diary = await import('../src/lib/services/diary');
	notebooks = await import('../src/lib/services/notebooks');
	ctx = { userId: OWNER, now: new Date('2026-09-19T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	book = notebooks.createNotebook(ctx, { title: 'Kitchen' });
});

const madeInBook = (over: Record<string, unknown> = {}) =>
	diary.createEntry(ctx, { content: 'the wall', title: 'Measurements', notebookId: book, ...over });

const read = (id: number) => diary.getEntry(ctx, id);
const tagsOf = (id: number) => (diary.tagsForEntries(ctx, [id]).get(id) ?? []).map((t) => t.name);

describe('reading one before writing it', () => {
	test('gives the words, the name and where it lives', () => {
		const id = madeInBook();
		expect(read(id)).toMatchObject({
			title: 'Measurements',
			content: 'the wall',
			notebookId: book
		});
	});

	test('refuses somebody else’s id the way everything else does', () => {
		const id = madeInBook();
		expect(() => diary.getEntry(theirs, id)).toThrow();
	});
});

describe('an edit changes only what it names', () => {
	test('the words, leaving the name and the notebook alone', () => {
		const id = madeInBook();
		diary.updateEntry(ctx, id, { content: 'the wall is 2.4m' });
		expect(read(id)).toMatchObject({
			content: 'the wall is 2.4m',
			title: 'Measurements',
			notebookId: book
		});
	});

	test('the name, leaving the words alone', () => {
		const id = madeInBook();
		diary.updateEntry(ctx, id, { content: 'the wall', title: 'Wall' });
		expect(read(id)).toMatchObject({ title: 'Wall', content: 'the wall' });
	});

	/*
	 * The one that was actually broken: tags were replaced on every update, so
	 * an edit that said nothing about them took them all off.
	 */
	test('saying nothing about the tags keeps them', () => {
		const id = madeInBook({ tags: 'kitchen wall' });
		expect(tagsOf(id).sort()).toEqual(['kitchen', 'wall']);
		diary.updateEntry(ctx, id, { content: 'the wall is 2.4m' });
		expect(tagsOf(id).sort()).toEqual(['kitchen', 'wall']);
	});

	test('naming them replaces them, and an empty string takes them off', () => {
		const id = madeInBook({ tags: 'kitchen wall' });
		diary.updateEntry(ctx, id, { content: 'the wall', tags: 'plumbing' });
		expect(tagsOf(id)).toEqual(['plumbing']);
		diary.updateEntry(ctx, id, { content: 'the wall', tags: '' });
		expect(tagsOf(id)).toEqual([]);
	});

	test('saying nothing about the notebook leaves it where it is', () => {
		const id = madeInBook();
		diary.updateEntry(ctx, id, { content: 'still here' });
		expect(read(id).notebookId).toBe(book);
	});

	test('a stranger cannot rewrite it', () => {
		const id = madeInBook();
		expect(() => diary.updateEntry(theirs, id, { content: 'mine now' })).toThrow();
		expect(read(id).content).toBe('the wall');
	});
});
