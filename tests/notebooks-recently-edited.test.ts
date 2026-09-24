/**
 * Which notebooks the dashboard card shows.
 *
 * "Recently edited" has to mean what somebody reading it expects: the notebook
 * they wrote in this morning, not the one they renamed last week. So the stamp
 * is the newest of anything the notebook holds, and the notebook's own row
 * counts too — a notebook just made and not yet written in is recent.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let ctx: { userId: string; now: Date; tz: string };

/** The same account, acting at a given moment. */
const at = (when: string) => ({ ...ctx, now: new Date(when) });

let kitchen: number;
let trip: number;
let reading: number;

beforeAll(async () => {
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	ctx = { userId: OWNER, now: new Date('2026-09-01T09:00:00'), tz: 'UTC' };

	kitchen = notebooks.createNotebook(at('2026-09-01T09:00:00'), { title: 'Kitchen' });
	trip = notebooks.createNotebook(at('2026-09-02T09:00:00'), { title: 'Trip' });
	reading = notebooks.createNotebook(at('2026-09-03T09:00:00'), { title: 'Reading' });
});

const order = () => notebooks.recentlyEditedNotebooks(ctx, 3).map((n) => n.id);

test('with nothing written in them, the newest notebook is first', () => {
	expect(order()).toEqual([reading, trip, kitchen]);
});

test('writing in one puts it above a notebook made later', () => {
	diary.createEntry(at('2026-09-04T09:00:00'), {
		content: 'the plumber can move the pipes',
		notebookId: kitchen
	});
	expect(order()[0]).toBe(kitchen);
});

test('a closed notebook is history, so it leaves the list', () => {
	notebooks.setNotebookClosed(at('2026-09-05T09:00:00'), kitchen, true);
	expect(order()).not.toContain(kitchen);
});

test('it answers with at most what it was asked for', () => {
	expect(notebooks.recentlyEditedNotebooks(ctx, 1)).toHaveLength(1);
	expect(notebooks.recentlyEditedNotebooks(ctx, 1)[0].id).toBe(reading);
});
