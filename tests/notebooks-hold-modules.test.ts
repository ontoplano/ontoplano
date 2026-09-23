/**
 * A notebook holds more than writing.
 *
 * Notes, tasks and goals were the whole of it; a subject also accumulates the
 * things it needs bought, the account it is paid from, the invoices, the
 * habits it asks for. Each of those already has a room, and a notebook is the
 * same rows seen from the subject — which is why the two promises tested here
 * are the ones that matter: what is filed under a notebook is still its room's
 * row, and deleting the notebook leaves every one of them where it is.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let notebooks: typeof import('../src/lib/services/notebooks');
let habits: typeof import('../src/lib/services/habits');
let inventory: typeof import('../src/lib/services/inventory');
let ideas: typeof import('../src/lib/services/ideas');
let ledgers: typeof import('../src/lib/services/ledgers');
let bills: typeof import('../src/lib/services/bills');
let workouts: typeof import('../src/lib/services/workouts');
let recipes: typeof import('../src/lib/services/recipes');
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	notebooks = await import('../src/lib/services/notebooks');
	habits = await import('../src/lib/services/habits');
	inventory = await import('../src/lib/services/inventory');
	ideas = await import('../src/lib/services/ideas');
	ledgers = await import('../src/lib/services/ledgers');
	bills = await import('../src/lib/services/bills');
	workouts = await import('../src/lib/services/workouts');
	recipes = await import('../src/lib/services/recipes');
	ctx = { userId: OWNER, now: new Date('2026-09-23T09:00:00'), tz: 'UTC' };
});

describe('what a notebook holds', () => {
	test('a new one starts with notes and tasks, and nothing else', () => {
		const id = notebooks.createNotebook(ctx, { title: 'A reading list' });
		expect(notebooks.getNotebook(ctx, id).modules).toEqual(['notes', 'tasks']);
	});

	test('switching a module on is what puts its tab there', () => {
		const id = notebooks.createNotebook(ctx, { title: 'A kitchen' });
		notebooks.updateNotebook(ctx, id, {
			title: 'A kitchen',
			modules: ['notes', 'tasks', 'inventory', 'bills']
		});
		expect(notebooks.getNotebook(ctx, id).modules).toEqual([
			'notes',
			'tasks',
			'inventory',
			'bills'
		]);
	});

	/*
	 * The one an assistant gets wrong: renaming a notebook over MCP says
	 * nothing about its tabs and must not be read as clearing them.
	 */
	test('a change that says nothing about the modules leaves them alone', () => {
		const id = notebooks.createNotebook(ctx, { title: 'A trip' });
		notebooks.updateNotebook(ctx, id, { title: 'A trip', modules: ['notes', 'tasks', 'ledgers'] });
		notebooks.updateNotebook(ctx, id, { title: 'A long trip' });
		expect(notebooks.getNotebook(ctx, id).modules).toContain('ledgers');
	});

	test('the choices offered say how much is already filed under each', () => {
		const id = notebooks.createNotebook(ctx, { title: 'A renovation' });
		inventory.createItem(ctx, { name: 'tiles', type: 'someday', notebookId: id });
		inventory.createItem(ctx, { name: 'grout', type: 'someday', notebookId: id });

		const offered = notebooks.moduleChoices(ctx, id);
		expect(offered.find((m) => m.id === 'inventory')?.held).toBe(2);
		// Counted whether or not it is switched on: turning a module off is one
		// tab fewer, not two things deleted, and the dialog has to say so.
		expect(offered.find((m) => m.id === 'inventory')?.on).toBe(false);
		expect(offered.find((m) => m.id === 'notes')?.always).toBe(true);
	});
});

describe('the rows filed under one', () => {
	test('each room answers with its own rows, narrowed to the subject', () => {
		const mine = notebooks.createNotebook(ctx, { title: 'The bathroom' });
		const other = notebooks.createNotebook(ctx, { title: 'Somewhere else' });

		habits.createHabit(ctx, { name: 'run the extractor', notebookId: mine });
		ideas.createIdea(ctx, { content: 'heated towel rail', notebookId: mine });
		inventory.createItem(ctx, { name: 'sealant', type: 'someday', notebookId: mine });
		ledgers.createLedger(ctx, { name: 'Bathroom account', notebookId: mine });
		bills.createBill(ctx, { name: 'plumber', notebookId: mine });
		workouts.createWorkout(ctx, { title: 'carrying tiles', notebookId: mine });
		recipes.createRecipe(ctx, { title: 'builders tea', notebookId: mine });

		// One thing filed somewhere else, so a query that forgot to narrow
		// would be caught rather than passing on a list of one.
		inventory.createItem(ctx, { name: 'unrelated', type: 'someday', notebookId: other });

		const held = notebooks.contentsOf(ctx, mine);
		expect(held.habits.map((h) => h.name)).toEqual(['run the extractor']);
		expect(held.ideas.map((i) => i.content)).toEqual(['heated towel rail']);
		expect(held.inventory.map((i) => i.name)).toEqual(['sealant']);
		expect(held.ledgers.map((l) => l.name)).toEqual(['Bathroom account']);
		expect(held.bills.map((b) => b.name)).toEqual(['plumber']);
		expect(held.workouts.map((w) => w.title)).toEqual(['carrying tiles']);
		expect(held.recipes.map((r) => r.title)).toEqual(['builders tea']);
	});

	test('the tally counts each module separately', () => {
		const id = notebooks.createNotebook(ctx, { title: 'A counted subject' });
		inventory.createItem(ctx, { name: 'one thing', type: 'someday', notebookId: id });
		bills.createBill(ctx, { name: 'one bill', notebookId: id });

		const counts = notebooks.getNotebook(ctx, id).counts;
		expect(counts.inventory).toBe(1);
		expect(counts.bills).toBe(1);
		expect(counts.recipes).toBe(0);
	});

	/*
	 * The promise the notebook has always made, now that six more things can
	 * point at one: the notebook goes and nothing it pointed at goes with it.
	 */
	test('deleting the notebook leaves everything it held exactly where it is', () => {
		const id = notebooks.createNotebook(ctx, { title: 'A finished job' });
		const habit = habits.createHabit(ctx, { name: 'sweep up', notebookId: id });
		const item = inventory.createItem(ctx, { name: 'dust sheet', type: 'someday', notebookId: id });
		const bill = bills.createBill(ctx, { name: 'skip hire', notebookId: id });
		const ledger = ledgers.createLedger(ctx, { name: 'Job account', notebookId: id });

		notebooks.deleteNotebook(ctx, id);

		expect(habits.listHabits(ctx).find((h) => h.id === habit)?.notebookId).toBeNull();
		expect(inventory.listItems(ctx).find((i) => i.id === item.id)?.notebookId).toBeNull();
		expect(bills.getBill(ctx, bill.id).notebookId).toBeNull();
		expect(ledgers.getLedger(ctx, ledger.id).notebookId).toBeNull();
	});
});
