/**
 * A notebook's labels are where the next note's labels start.
 *
 * The distinction the whole feature turns on: they are a suggestion, not a
 * rule. A note that says nothing about labels takes them, and a note that says
 * "none" keeps none — otherwise nobody could write the one note about a
 * renovation that is not about the renovation's budget.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let ctx: ReturnType<typeof buildCtx>;

const labelsOn = (entryId: number) =>
	[...(diary.tagsForEntries(ctx, [entryId]).get(entryId) ?? [])].map((tag) => tag.name).sort();

beforeAll(async () => {
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	({ buildCtx } = await import('../src/lib/services/ctx'));
	ctx = buildCtx(OWNER, { tz: 'UTC' });
});

describe('the labels a notebook lends its notes', () => {
	test('a notebook starts with none', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Plain' });
		expect(notebooks.getNotebook(ctx, id).defaultTags).toBe('');
	});

	test('they are kept as tags are written, not as they were typed', () => {
		const id = notebooks.createNotebook(ctx, {
			title: 'Renovation',
			defaultTags: '#Kitchen  budget, KITCHEN'
		});
		expect(notebooks.getNotebook(ctx, id).defaultTags).toBe('kitchen, budget');
	});

	test('a note written into it with no labels of its own takes them', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Trip', defaultTags: 'travel, japan' });
		const entry = diary.createEntry(ctx, { content: 'Landed.', notebookId: id });
		expect(labelsOn(entry)).toEqual(['japan', 'travel']);
	});

	test('and a note that names its own labels is left exactly as asked', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Book', defaultTags: 'reading' });
		const entry = diary.createEntry(ctx, { content: 'Chapter 4.', notebookId: id, tags: 'quotes' });
		expect(labelsOn(entry)).toEqual(['quotes']);
	});

	/*
	 * The case the whole design is for: the form sends whatever is in the box,
	 * so somebody who cleared it sends an empty string. Treating that as "said
	 * nothing" would put the labels back and make clearing them impossible.
	 */
	test('an empty string is somebody clearing them, and is obeyed', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Garden', defaultTags: 'outside' });
		const entry = diary.createEntry(ctx, { content: 'Rained.', notebookId: id, tags: '' });
		expect(labelsOn(entry)).toEqual([]);
	});

	test('a note filed nowhere takes none, and nothing throws looking', () => {
		const entry = diary.createEntry(ctx, { content: 'Loose thought.' });
		expect(labelsOn(entry)).toEqual([]);
	});

	test('they can be changed and cleared on a notebook that exists', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Health', defaultTags: 'body' });
		notebooks.updateNotebook(ctx, id, { title: 'Health', defaultTags: 'body, sleep' });
		expect(notebooks.getNotebook(ctx, id).defaultTags).toBe('body, sleep');

		notebooks.updateNotebook(ctx, id, { title: 'Health', defaultTags: '' });
		expect(notebooks.getNotebook(ctx, id).defaultTags).toBe('');
	});

	test('and left out of a change, they are untouched', () => {
		const id = notebooks.createNotebook(ctx, { title: 'Money', defaultTags: 'bills' });
		notebooks.updateNotebook(ctx, id, { title: 'Money', description: 'What it costs' });
		expect(notebooks.getNotebook(ctx, id).defaultTags).toBe('bills');
	});

	test('the picker carries them, which is what the note form fills from', () => {
		notebooks.createNotebook(ctx, { title: 'Studio', defaultTags: 'music' });
		const picked = notebooks.pickableNotebooks(ctx).find((one) => one.title === 'Studio');
		expect(picked?.defaultTags).toBe('music');
	});
});
