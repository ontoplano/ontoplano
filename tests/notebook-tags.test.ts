/**
 * A label inside one notebook.
 *
 * The Tags screen counts a word across the whole account, which answers a
 * question nobody has: `#home` doing forty things somewhere is not why it is
 * on this renovation. Inside a notebook the count is the subject's own and it
 * says what carries it — two notes and one task — because "three things have
 * it" does not tell anybody where to go and look.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let tagsService: typeof import('../src/lib/services/tags');
let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let todos: typeof import('../src/lib/services/todos');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let kitchen: number;
let trip: number;

beforeAll(async () => {
	tagsService = await import('../src/lib/services/tags');
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	todos = await import('../src/lib/services/todos');
	ctx = { userId: OWNER, now: new Date('2026-09-01T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen' });
	trip = notebooks.createNotebook(ctx, { title: 'Trip' });

	diary.createEntry(ctx, {
		content: 'the plumber can move the pipes',
		tags: 'home',
		notebookId: kitchen
	});
	diary.createEntry(ctx, {
		content: 'tiles are the slow bit',
		tags: 'home, money',
		notebookId: kitchen
	});
	todos.createTodo(ctx, { title: 'book the plumber', tags: 'home', notebookId: kitchen });
	todos.createTodo(ctx, { title: 'book the flights', tags: 'money', notebookId: trip });
});

const inKitchen = () => tagsService.tagsInNotebook(OWNER, kitchen);

test('counts only what is filed in that notebook, and says what carries it', () => {
	const home = inKitchen().find((one) => one.name === 'home')!;

	expect(home.uses).toBe(3);
	// Canonical order — the order a notebook's own tabs run in.
	expect(home.by).toEqual([
		{ kind: 'notes', count: 2 },
		{ kind: 'tasks', count: 1 }
	]);
});

test('a label used in another notebook is not this one’s', () => {
	const money = inKitchen().find((one) => one.name === 'money')!;

	// One note here; the task that carries it is filed under the trip.
	expect(money.by).toEqual([{ kind: 'notes', count: 1 }]);
	expect(inKitchen().map((one) => one.name)).not.toContain('nothing');
});

test('a notebook’s own suggestion is listed at nought, once the label exists', () => {
	// Used somewhere else, so it is a label; suggested here, so it is part of
	// this subject's vocabulary — and nothing in here wears it yet.
	todos.createTodo(ctx, { title: 'ring the plumber', tags: 'plumbing', notebookId: trip });
	notebooks.updateNotebook(ctx, kitchen, { title: 'Kitchen', defaultTags: 'home, plumbing' });

	const plumbing = inKitchen().find((one) => one.name === 'plumbing');
	expect(plumbing, 'a suggestion is this subject’s vocabulary').toBeDefined();
	expect(plumbing!.uses).toBe(0);
	expect(plumbing!.by).toEqual([]);

	// A word nobody has ever put on anything is text in a field, not a label.
	notebooks.updateNotebook(ctx, kitchen, { title: 'Kitchen', defaultTags: 'home, sorcery' });
	expect(inKitchen().map((one) => one.name)).not.toContain('sorcery');
});

test('a stranger asking about this notebook is told nothing', () => {
	// Not an error — the same answer an id that never existed gets (I1/I3).
	expect(tagsService.tagsInNotebook(STRANGER, kitchen)).toEqual([]);
	expect(theirs.userId).toBe(STRANGER);
});

test('what a label means is the account’s to write, and to take away', () => {
	const home = inKitchen().find((one) => one.name === 'home')!;

	expect(tagsService.describeTag(OWNER, home.id, 'anything about the house').description).toBe(
		'anything about the house'
	);
	expect(inKitchen().find((one) => one.id === home.id)!.description).toBe(
		'anything about the house'
	);

	expect(tagsService.describeTag(OWNER, home.id, '').description).toBe('');
});

test('a stranger cannot describe this account’s label', () => {
	const home = inKitchen().find((one) => one.name === 'home')!;
	expect(() => tagsService.describeTag(STRANGER, home.id, 'mine now')).toThrow();
});
