/**
 * The journal, and the notes that share its table.
 *
 * These are the rules that broke in review: notes leaking into the diary, an
 * entry numbered by the account when it should be numbered by its notebook, and
 * a deleted notebook dropping its notes into the journal.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let diary: typeof import('../src/lib/server/services/diary');
let notebooks: typeof import('../src/lib/server/services/notebooks');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	diary = await import('../src/lib/server/services/diary');
	notebooks = await import('../src/lib/server/services/notebooks');
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('a notebook holds notes, the diary holds entries', () => {
	test('a note does not appear in the journal', () => {
		const kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen', description: '' });
		diary.createEntry(ctx, { content: 'the tiler comes Tuesday', notebookId: kitchen });
		diary.createEntry(ctx, { content: 'ran 8km' });

		const journal = diary.listEntries(ctx).map((e) => e.content);
		expect(journal).toContain('ran 8km');
		expect(journal).not.toContain('the tiler comes Tuesday');
	});

	test('a note is numbered by its notebook', () => {
		const trip = notebooks.createNotebook(ctx, { title: 'Trip', description: '' });
		diary.createEntry(ctx, { content: 'first', notebookId: trip });
		diary.createEntry(ctx, { content: 'second', notebookId: trip });

		const numbers = notebooks
			.contentsOf(ctx, trip)
			.entries.map((e) => e.seq)
			.sort();
		expect(numbers).toEqual([1, 2]);
	});

	test('two notebooks number independently', () => {
		const a = notebooks.createNotebook(ctx, { title: 'A', description: '' });
		const b = notebooks.createNotebook(ctx, { title: 'B', description: '' });
		diary.createEntry(ctx, { content: 'a1', notebookId: a });
		diary.createEntry(ctx, { content: 'b1', notebookId: b });

		expect(notebooks.contentsOf(ctx, a).entries[0].seq).toBe(1);
		expect(notebooks.contentsOf(ctx, b).entries[0].seq).toBe(1);
	});
});

describe('deleting a notebook', () => {
	test('keeps the notes out of the journal', () => {
		const gone = notebooks.createNotebook(ctx, { title: 'Doomed', description: '' });
		diary.createEntry(ctx, { content: 'a note that outlives its notebook', notebookId: gone });

		notebooks.deleteNotebook(ctx, gone);

		expect(diary.listEntries(ctx).map((e) => e.content)).not.toContain(
			'a note that outlives its notebook'
		);
		expect(notebooks.listOrphanedNotes(ctx).map((e) => e.content)).toContain(
			'a note that outlives its notebook'
		);
	});
});

describe('ownership', () => {
	test('one account cannot read another notebook', () => {
		const mine = notebooks.createNotebook(ctx, { title: 'Mine', description: '' });
		expect(() => notebooks.getNotebook(theirs, mine)).toThrow();
	});

	test('nor its entries', () => {
		diary.createEntry(ctx, { content: 'private' });
		expect(diary.listEntries(theirs).map((e) => e.content)).not.toContain('private');
	});
});

describe('numbering', () => {
	test('every entry gets its own account number', () => {
		const before = diary.listEntries(ctx).map((e) => e.seq);
		diary.createEntry(ctx, { content: 'next' });
		const after = diary.listEntries(ctx).map((e) => e.seq);

		expect(new Set(after).size).toBe(after.length);
		expect(Math.max(...after)).toBeGreaterThan(Math.max(...before, 0));
	});
});
