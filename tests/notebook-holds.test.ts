/**
 * A thing is filed only into a notebook with its tab.
 *
 * A notebook's `modules` are its tabs, and a thing filed into one without the
 * tab for its kind is shown nowhere inside it — an idea in a notebook with
 * only Notes and Tasks simply vanished. So filing refuses it, naming the tab,
 * from every door: the forms, the API and MCP all reach these services.
 *
 * Two things stay allowed: unfiling, and staying put. Switching a tab off
 * takes the tab, not the things, so an edit that posts back the notebook a
 * thing is already in must not be refused for it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
import type { NotebookModule } from '../src/lib/notebook-modules';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00Z'), tz: 'UTC' };

let notebooks: typeof import('../src/lib/services/notebooks');
let category = 0;

type Kind = {
	module: NotebookModule;
	create: (notebookId: number | null) => number;
	update: (id: number, notebookId: number | null) => void;
};
let kinds: Kind[] = [];

beforeAll(async () => {
	notebooks = await import('../src/lib/services/notebooks');
	const ideas = await import('../src/lib/services/ideas');
	const todos = await import('../src/lib/services/todos');
	const goals = await import('../src/lib/services/goals');
	const inventory = await import('../src/lib/services/inventory');
	const ledgers = await import('../src/lib/services/ledgers');
	const bills = await import('../src/lib/services/bills');
	const habits = await import('../src/lib/services/habits');
	const workouts = await import('../src/lib/services/workouts');
	const recipes = await import('../src/lib/services/recipes');
	const slots = await import('../src/lib/services/slots');
	const activities = await import('../src/lib/services/activities');
	category = activities.createCategory(ctx, { name: 'Home', color: '#1d4ed8' });

	let n = 0;
	const name = () => `thing ${++n}`;
	kinds = [
		{
			module: 'ideas',
			create: (notebookId) => ideas.createIdea(ctx, { content: name(), notebookId }),
			update: (id, notebookId) => ideas.updateIdea(ctx, id, { content: 'again', notebookId })
		},
		{
			module: 'tasks',
			create: (notebookId) => todos.createTodo(ctx, { title: name(), notebookId }),
			update: (id, notebookId) => todos.updateTodo(ctx, id, { title: 'again', notebookId })
		},
		{
			module: 'tasks',
			create: (notebookId) =>
				slots.createSlot(ctx, {
					weekday: 1,
					startTime: '09:00',
					durationMinutes: 30,
					mode: 'category',
					categoryId: category,
					label: name(),
					notebookId
				}),
			update: (id, notebookId) =>
				slots.updateSlot(ctx, id, {
					weekday: 1,
					startTime: '09:00',
					durationMinutes: 30,
					mode: 'category',
					categoryId: category,
					label: 'again',
					notebookId
				})
		},
		{
			module: 'goals',
			create: (notebookId) =>
				goals.createGoal(ctx, { title: name(), horizon: 'month', notebookId }),
			update: (id, notebookId) => goals.updateGoal(ctx, id, { title: 'again', notebookId })
		},
		{
			module: 'inventory',
			create: (notebookId) =>
				inventory.createItem(ctx, { name: name(), type: 'someday', notebookId }).id,
			update: (id, notebookId) =>
				inventory.updateItem(ctx, id, { name: `again ${id}`, type: 'someday', notebookId })
		},
		{
			module: 'ledgers',
			create: (notebookId) => ledgers.createLedger(ctx, { name: name(), notebookId }).id,
			update: (id, notebookId) => void ledgers.updateLedger(ctx, id, { notebookId })
		},
		{
			module: 'bills',
			create: (notebookId) => bills.createBill(ctx, { name: name(), notebookId }).id,
			update: (id, notebookId) => void bills.updateBill(ctx, id, { name: 'again', notebookId })
		},
		{
			module: 'habits',
			create: (notebookId) => habits.createHabit(ctx, { name: name(), notebookId }),
			update: (id, notebookId) => habits.updateHabit(ctx, id, { name: 'again', notebookId })
		},
		{
			module: 'workouts',
			create: (notebookId) => workouts.createWorkout(ctx, { title: name(), notebookId }),
			update: (id, notebookId) => workouts.updateWorkout(ctx, id, { title: 'again', notebookId })
		},
		{
			module: 'recipes',
			create: (notebookId) => recipes.createRecipe(ctx, { title: name(), notebookId }),
			update: (id, notebookId) => recipes.updateRecipe(ctx, id, { title: 'again', notebookId })
		}
	];
});

let made = 0;
/** A fresh notebook holding these, so one test's switch does not reach another's. */
const notebookHolding = (modules: string[]) =>
	notebooks.createNotebook(ctx, { title: `Notebook ${++made}`, modules });

/** The refusal is a validation error with the key naming the missing tab. */
function refused(fn: () => unknown, module: NotebookModule) {
	let caught: unknown;
	try {
		fn();
	} catch (e) {
		caught = e;
	}
	expect(caught, `filing into a notebook without ${module} was accepted`).toBeTruthy();
	const error = caught as { code?: string; key?: string; values?: Record<string, unknown> };
	expect(error.code).toBe('validation_error');
	expect(error.key).toMatch(/^errors\.notebooks\.hasNo\w+Tab$/);
	expect(String(error.values?.notebook)).toMatch(/^Notebook \d+$/);
}

describe('filing into a notebook', () => {
	test('is refused when the notebook has no tab for the kind', () => {
		for (const kind of kinds) {
			const bare = notebookHolding(['notes']);
			refused(() => kind.create(bare), kind.module);
		}
	});

	test('is allowed when it has the tab, and unfiled always', () => {
		for (const kind of kinds) {
			const holding = notebookHolding(['notes', kind.module]);
			expect(() => kind.create(holding)).not.toThrow();
			expect(() => kind.create(null)).not.toThrow();
		}
	});

	test('an edit may keep a thing where it is after the tab is switched off', () => {
		for (const kind of kinds) {
			const holding = notebookHolding(['notes', kind.module]);
			const id = kind.create(holding);
			notebooks.updateNotebook(ctx, holding, { modules: ['notes'] });

			// Staying put, and leaving, both pass.
			expect(() => kind.update(id, holding)).not.toThrow();
			expect(() => kind.update(id, null)).not.toThrow();
			// Coming back in is new filing, and is refused.
			refused(() => kind.update(id, holding), kind.module);
		}
	});

	test('a move into another notebook without the tab is refused', () => {
		for (const kind of kinds) {
			const id = kind.create(notebookHolding(['notes', kind.module]));
			refused(() => kind.update(id, notebookHolding(['notes'])), kind.module);
		}
	});

	test('notes go anywhere: every notebook holds them', async () => {
		const diary = await import('../src/lib/services/diary');
		const bare = notebookHolding([]);
		expect(() => diary.createEntry(ctx, { content: 'a note', notebookId: bare })).not.toThrow();
	});
});

describe('the other ways in', () => {
	test('bringing something in from the tab picker is refused without the tab', async () => {
		const { fileUnderNotebook } = await import('../src/lib/services/notebook-linking');
		const { createIdea } = await import('../src/lib/services/ideas');
		const idea = createIdea(ctx, { content: 'loose idea' });

		refused(() => fileUnderNotebook(ctx, 'ideas', idea, notebookHolding(['notes'])), 'ideas');
		expect(() =>
			fileUnderNotebook(ctx, 'ideas', idea, notebookHolding(['notes', 'ideas']))
		).not.toThrow();
		expect(() => fileUnderNotebook(ctx, 'ideas', idea, null)).not.toThrow();
	});

	test('moving todos in a batch is refused, whole, without a Tasks tab', async () => {
		const todos = await import('../src/lib/services/todos');
		const ids = [todos.createTodo(ctx, { title: 'one' }), todos.createTodo(ctx, { title: 'two' })];

		refused(
			() => todos.batchTodos(ctx, 'notebook', ids, { notebookId: notebookHolding(['notes']) }),
			'tasks'
		);
		expect(
			todos
				.listTodos(ctx)
				.filter((t) => ids.includes(t.id))
				.map((t) => t.notebookId)
		).toEqual([null, null]);
	});

	test("a note's checkboxes become unfiled tasks when its notebook has no Tasks tab", async () => {
		const diary = await import('../src/lib/services/diary');
		const { makeTodosFromEntry } = await import('../src/lib/services/note-todos');
		const todos = await import('../src/lib/services/todos');
		const bare = notebookHolding(['notes']);
		const entry = diary.createEntry(ctx, { content: '- [ ] fix the tap', notebookId: bare });

		const { ids } = makeTodosFromEntry(ctx, entry);
		expect(ids).toHaveLength(1);
		expect(todos.getTodo(ctx, ids[0]).notebookId).toBeNull();
	});
});

describe('the pickers', () => {
	test('offer only the notebooks with the tab, and the one a thing is already in', async () => {
		const { notebooksHolding } = await import('../src/lib/notebook-modules');
		const holding = notebookHolding(['notes', 'ideas']);
		const bare = notebookHolding(['notes']);
		const offered = notebooks.pickableNotebooks(ctx);

		const ids = (keep?: number) => notebooksHolding(offered, 'ideas', keep).map((one) => one.id);
		expect(ids()).toContain(holding);
		expect(ids()).not.toContain(bare);
		expect(ids(bare)).toContain(bare);
		// Notes are held by every notebook.
		expect(notebooksHolding(offered, 'notes').map((one) => one.id)).toContain(bare);
	});
});
