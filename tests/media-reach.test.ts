/**
 * A file belongs to whatever refers to it.
 *
 * The route that serves a picture took a session and nothing else, so a key
 * granted "read your notebooks" fetched the words of a note and got a 404 for
 * every picture in it — which makes briefing an assistant with screenshots
 * impossible, and that is the ordinary way to brief one.
 *
 * The rule now is that the permission a file needs is the permission for the
 * thing that uses it. What that costs is exactness about *what* uses it, which
 * is what this pins down: the id boundary (`/media/1` is not inside
 * `/media/17`), the kinds, and the notebook a referrer sits in, because a key
 * confined to one notebook may see that notebook's pictures and no others.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let referrers: typeof import('../src/lib/services/media-referrers');
let diary: typeof import('../src/lib/services/diary');
let ideas: typeof import('../src/lib/services/ideas');
let todos: typeof import('../src/lib/services/todos');
let notebooks: typeof import('../src/lib/services/notebooks');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	referrers = await import('../src/lib/services/media-referrers');
	diary = await import('../src/lib/services/diary');
	ideas = await import('../src/lib/services/ideas');
	todos = await import('../src/lib/services/todos');
	notebooks = await import('../src/lib/services/notebooks');
	ctx = { userId: OWNER, now: new Date('2026-09-19T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('what refers to a picture', () => {
	test('a note that embeds it, and the notebook that note is in', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Kitchen' });
		diary.createEntry(ctx, { content: 'the wall ![w](/media/12)', notebookId: book });

		const found = referrers.pictureReferrers(ctx, 12);
		expect(found).toHaveLength(1);
		expect(found[0].kind).toBe('note');
		expect(found[0].notebookId).toBe(book);
	});

	test('a note in no notebook says so rather than naming one', () => {
		diary.createEntry(ctx, { content: 'a day ![d](/media/13)' });
		expect(referrers.pictureReferrers(ctx, 13)[0]).toMatchObject({
			kind: 'note',
			notebookId: null
		});
	});

	/*
	 * The one that was missing, and the gap it left.
	 *
	 * A picture pasted into a task or an idea was referred to by nothing, so
	 * it was reachable by nobody — the recording side had both of these and
	 * the picture side did not, which is the kind of asymmetry only a test
	 * asking the same question of both ever finds.
	 */
	test('an idea and a task count too, and each says where it lives', () => {
		// Its own notebook name: the database is shared across this file, and a
		// title collides account-wide.
		const book = notebooks.createNotebook(ctx, { title: 'The leak' });
		ideas.createIdea(ctx, { content: 'thought ![b](/media/41)' });
		todos.createTodo(ctx, {
			title: 'ring the plumber',
			notes: 'the leak ![c](/media/41)',
			notebookId: book
		});

		const found = referrers.pictureReferrers(ctx, 41);
		expect(found.map((r) => r.kind).sort()).toEqual(['idea', 'todo']);
		expect(found.find((r) => r.kind === 'todo')?.notebookId).toBe(book);
		// An idea lives in no notebook, and saying null is what refuses it to a
		// key confined to one.
		expect(found.find((r) => r.kind === 'idea')?.notebookId).toBeNull();
	});

	test('nothing at all, for a picture nobody has used', () => {
		expect(referrers.pictureReferrers(ctx, 999)).toEqual([]);
	});

	/*
	 * The boundary, which is the whole safety of a LIKE over somebody's prose:
	 * if `/media/1` matched inside `/media/17`, a key that may read one note
	 * would reach a picture from another.
	 */
	test('an id is not found inside a longer one', () => {
		diary.createEntry(ctx, { content: 'later ![x](/media/170)' });
		expect(referrers.pictureReferrers(ctx, 17)).toEqual([]);
		expect(referrers.pictureReferrers(ctx, 170)).toHaveLength(1);
	});

	test('another account’s writing is not a referrer', () => {
		diary.createEntry(theirs, { content: 'mine ![m](/media/12)' });
		expect(referrers.pictureReferrers(ctx, 12)).toHaveLength(1);
		expect(referrers.pictureReferrers(theirs, 12)).toHaveLength(1);
	});
});

describe('what refers to a recording', () => {
	test('a note, an idea and a task each count, and each says where it lives', () => {
		const book = notebooks.createNotebook(ctx, { title: 'Renovation' });
		diary.createEntry(ctx, { content: 'said [a](/media/audio/40)', notebookId: book });
		ideas.createIdea(ctx, { content: 'thought [b](/media/audio/40)' });
		todos.createTodo(ctx, {
			title: 'ring the plumber',
			notes: 'what he said [c](/media/audio/40)',
			notebookId: book
		});

		const found = referrers.recordingReferrers(ctx, 40);
		expect(found.map((r) => r.kind).sort()).toEqual(['idea', 'note', 'todo']);
		expect(found.find((r) => r.kind === 'note')?.notebookId).toBe(book);
		expect(found.find((r) => r.kind === 'todo')?.notebookId).toBe(book);
		// An idea lives in no notebook, and saying null is what refuses it to a
		// key confined to one.
		expect(found.find((r) => r.kind === 'idea')?.notebookId).toBeNull();
	});

	test('a recording’s id is not found inside a longer one either', () => {
		ideas.createIdea(ctx, { content: 'later [d](/media/audio/404)' });
		expect(referrers.recordingReferrers(ctx, 40).some((r) => r.kind === 'idea')).toBe(true);
		expect(referrers.recordingReferrers(ctx, 4)).toEqual([]);
	});

	test('a picture’s path is not mistaken for a recording’s', () => {
		diary.createEntry(ctx, { content: 'a picture ![p](/media/77)' });
		expect(referrers.recordingReferrers(ctx, 77)).toEqual([]);
		expect(referrers.pictureReferrers(ctx, 77)).toHaveLength(1);
	});
});
