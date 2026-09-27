/**
 * Several notes at once: moved, labelled, put away and deleted in one press,
 * all of it or none of it — and never somebody else's.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let diary: typeof import('../src/lib/services/diary');
let notebooks: typeof import('../src/lib/services/notebooks');
const ctx = { userId: OWNER, now: new Date('2026-09-27T12:00:00Z'), tz: 'UTC' };
const stranger = { ...ctx, userId: STRANGER };

beforeAll(async () => {
	diary = await import('../src/lib/services/diary');
	notebooks = await import('../src/lib/services/notebooks');
});

type Row = { notebookId: number | null; notebookSeq: number | null; diarySeq: number | null };
async function row(id: number): Promise<(Row & { archivedAt: string | null }) | undefined> {
	const { db } = await import('../src/lib/db/index');
	const { diaryEntries } = await import('../src/lib/db/schema');
	const { eq } = await import('drizzle-orm');
	return db
		.select({
			notebookId: diaryEntries.notebookId,
			notebookSeq: diaryEntries.notebookSeq,
			diarySeq: diaryEntries.diarySeq,
			archivedAt: diaryEntries.archivedAt
		})
		.from(diaryEntries)
		.where(eq(diaryEntries.id, id))
		.get();
}
const tagsOf = (id: number) => (diary.tagsForEntries(ctx, [id]).get(id) ?? []).map((t) => t.name);
const make = (notebookId: number | null = null) =>
	diary.createEntry(ctx, { content: 'a note', tags: 'keep old', notebookId });

describe('note selections', () => {
	test('moves into a notebook with fresh numbers, and back out into the diary', async () => {
		const into = notebooks.createNotebook(ctx, { title: 'Destination' });
		diary.createEntry(ctx, { content: 'already there', notebookId: into });
		const ids = [make(), make()];
		expect(diary.batchEntries(ctx, 'notebook', ids, { notebookId: into })).toBe(2);
		const moved = await Promise.all(ids.map(row));
		expect(moved.map((one) => one?.notebookId)).toEqual([into, into]);
		expect(moved.map((one) => one?.notebookSeq).sort()).toEqual([2, 3]);

		diary.batchEntries(ctx, 'notebook', ids, { notebookId: '' });
		const back = await Promise.all(ids.map(row));
		expect(back.map((one) => [one?.notebookId, one?.notebookSeq])).toEqual([
			[null, null],
			[null, null]
		]);
		expect(diary.listEntries(ctx).map((e) => e.id)).toEqual(expect.arrayContaining(ids));
	});

	test('a note moved into the diary gets a diary number', async () => {
		const from = notebooks.createNotebook(ctx, { title: 'Source' });
		const id = make(from);
		expect((await row(id))?.diarySeq).toBeNull();
		diary.batchEntries(ctx, 'notebook', [id], { notebookId: '' });
		expect((await row(id))?.diarySeq).toBeGreaterThan(0);
	});

	test('a note left behind by a deleted notebook can be sent to the diary', async () => {
		const gone = notebooks.createNotebook(ctx, { title: 'Soon gone' });
		const id = make(gone);
		notebooks.deleteNotebook(ctx, gone);
		expect(diary.listEntries(ctx).map((e) => e.id)).not.toContain(id);
		diary.batchEntries(ctx, 'notebook', [id], { notebookId: '' });
		expect(diary.listEntries(ctx).map((e) => e.id)).toContain(id);
	});

	test('labels are added and taken off without touching the others', () => {
		const ids = [make(), make()];
		diary.batchEntries(ctx, 'tag', ids, { add: 'new', remove: 'old' });
		expect(ids.map(tagsOf)).toEqual([
			['keep', 'new'],
			['keep', 'new']
		]);
	});

	test('puts away, brings back and deletes exactly the selection', async () => {
		const ids = [make(), make()];
		const kept = make();
		diary.batchEntries(ctx, 'archive', ids, {});
		expect((await Promise.all(ids.map(row))).every((one) => one?.archivedAt)).toBe(true);
		diary.batchEntries(ctx, 'unarchive', ids, {});
		expect((await Promise.all(ids.map(row))).every((one) => one?.archivedAt === null)).toBe(true);
		diary.batchEntries(ctx, 'remove', ids, {});
		expect(await Promise.all(ids.map(row))).toEqual([undefined, undefined]);
		expect(await row(kept)).toBeDefined();
	});

	for (const verb of ['notebook', 'tag', 'archive', 'unarchive', 'remove'] as const) {
		test(`${verb} rolls back when any selected note belongs to someone else`, async () => {
			const id = make();
			const theirs = diary.createEntry(stranger, { content: 'private', tags: 'theirs' });
			const before = [await row(id), tagsOf(id)];
			const other = await row(theirs);
			const what = {
				add: 'changed',
				notebookId: notebooks.createNotebook(ctx, { title: `X ${verb}` })
			};
			expect(() => diary.batchEntries(ctx, verb, [id, theirs], what)).toThrow();
			expect([await row(id), tagsOf(id)]).toEqual(before);
			expect(await row(theirs)).toEqual(other);
			expect(() => diary.batchEntries(ctx, verb, [id, 99999999], what)).toThrow();
			expect([await row(id), tagsOf(id)]).toEqual(before);
		});
	}

	test('refuses somebody else’s notebook as the destination', async () => {
		const id = make();
		const foreign = notebooks.createNotebook(stranger, { title: 'Theirs' });
		expect(() => diary.batchEntries(ctx, 'notebook', [id], { notebookId: foreign })).toThrow();
		expect((await row(id))?.notebookId).toBeNull();
	});

	test('refuses empty, malformed and oversized selections and unknown verbs', async () => {
		const id = make();
		for (const ids of [[], [id, 'oops'], [id, -1], Array(501).fill(id)]) {
			expect(() => diary.batchEntries(ctx, 'remove', ids, {})).toThrow();
			expect(await row(id)).toBeDefined();
		}
		expect(() => diary.batchEntries(ctx, 'status', [id], {})).toThrow();
		expect(() => diary.batchEntries(ctx, 'notebook', [id], {})).toThrow();
	});
});

describe('editing a note can move it', () => {
	test('a changed notebook renumbers rather than colliding', async () => {
		const a = notebooks.createNotebook(ctx, { title: 'A' });
		const b = notebooks.createNotebook(ctx, { title: 'B' });
		diary.createEntry(ctx, { content: 'first in b', notebookId: b });
		const id = make(a);
		expect((await row(id))?.notebookSeq).toBe(1);
		diary.updateEntry(ctx, id, { content: 'moved', notebookId: b });
		expect(await row(id)).toMatchObject({ notebookId: b, notebookSeq: 2 });
	});

	test('an edit that says nothing about the notebook leaves it', async () => {
		const a = notebooks.createNotebook(ctx, { title: 'Stay' });
		const id = make(a);
		diary.updateEntry(ctx, id, { content: 'still here' });
		expect((await row(id))?.notebookId).toBe(a);
	});

	test('cannot move a note into somebody else’s notebook, or move theirs', async () => {
		const id = make();
		const foreign = notebooks.createNotebook(stranger, { title: 'Nope' });
		expect(() => diary.updateEntry(ctx, id, { content: 'x', notebookId: foreign })).toThrow();
		const theirs = diary.createEntry(stranger, { content: 'theirs' });
		expect(() => diary.moveEntry(ctx, theirs, null)).toThrow();
		expect((await row(theirs))?.notebookId).toBeNull();
	});
});
