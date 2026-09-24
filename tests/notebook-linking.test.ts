/**
 * Bringing something that already exists under a subject.
 *
 * A notebook holds the row rather than a copy of it, so filing something that
 * is under another notebook *moves* it. What made that fail in the ordinary
 * case is the number: a note and a task are numbered inside their notebook as
 * well as in the account — `#4` on a card, and what `TASK:#4` in somebody's
 * writing points at — and the pair is unique. Carrying the old number into the
 * new notebook collided with whatever already held it, which is every notebook
 * with more than a couple of things in it, and the answer was "Unexpected
 * error".
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let linking: typeof import('../src/lib/services/notebook-linking');
let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let ctx: { userId: string; now: Date; tz: string };
let kitchen: number;
let trip: number;

beforeAll(async () => {
	linking = await import('../src/lib/services/notebook-linking');
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	ctx = { userId: OWNER, now: new Date('2026-09-01T09:00:00'), tz: 'UTC' };

	kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen' });
	trip = notebooks.createNotebook(ctx, { title: 'Trip' });
});

/** That note's number inside whichever notebook it is in. */
const seqOf = (id: number) =>
	notebooks.contentsOf(ctx, kitchen).entries.find((one) => one.id === id)?.seq ?? null;

test('a note brought from another notebook takes the next number here', () => {
	// Two already in the kitchen, so #1 and #2 are taken.
	diary.createEntry(ctx, { content: 'the plumber can move the pipes', notebookId: kitchen });
	diary.createEntry(ctx, { content: 'tiles are the slow bit', notebookId: kitchen });

	// And one under the trip, which is #1 over there — the number that would
	// collide if it came across with it.
	const moving = diary.createEntry(ctx, { content: 'nine days in September', notebookId: trip });

	linking.fileUnderNotebook(ctx, 'notes', moving, kitchen);

	expect(seqOf(moving)).toBe(3);
	expect(notebooks.contentsOf(ctx, kitchen).entries).toHaveLength(3);
	expect(notebooks.contentsOf(ctx, trip).entries).toHaveLength(0);
});

test('and it keeps working for the next one, and the one after', () => {
	const first = diary.createEntry(ctx, { content: 'the tiler wants a week', notebookId: trip });
	const second = diary.createEntry(ctx, { content: 'the skip is booked', notebookId: trip });

	linking.fileUnderNotebook(ctx, 'notes', first, kitchen);
	linking.fileUnderNotebook(ctx, 'notes', second, kitchen);

	expect([seqOf(first), seqOf(second)]).toEqual([4, 5]);
});

test('taking one out leaves it with no number in any notebook', () => {
	const loose = diary.createEntry(ctx, { content: 'nothing to do with any of it' });
	linking.fileUnderNotebook(ctx, 'notes', loose, kitchen);
	expect(seqOf(loose)).toBe(6);

	linking.fileUnderNotebook(ctx, 'notes', loose, null);
	expect(notebooks.contentsOf(ctx, kitchen).entries.some((one) => one.id === loose)).toBe(false);
});

test('a stranger cannot file this account’s note anywhere', () => {
	const mine = diary.createEntry(ctx, { content: 'mine', notebookId: trip });
	expect(() =>
		linking.fileUnderNotebook({ ...ctx, userId: STRANGER }, 'notes', mine, kitchen)
	).toThrow();
});

/*
 * The picker read `title` on a note, which a note usually has not got — the
 * writing is the note — so it drew a column of blank rows with a link icon on
 * each and "in another notebook" beside some of them.
 */
test('a note with no heading is listed by its first line', () => {
	const untitled = diary.createEntry(ctx, {
		content: 'Measured again: 3.42 by 2.79.\nThe old drawing was out.',
		notebookId: trip
	});

	const offered = linking.linkableInto(ctx, 'notes', kitchen).items;
	const row = offered.find((one) => one.id === untitled);

	expect(row?.label).toBe('Measured again: 3.42 by 2.79.');
	expect(offered.every((one) => one.label !== '')).toBe(true);
});
