/**
 * A notebook's category: what a new task filed there starts with.
 *
 * A suggestion, the way a notebook's labels are for a note — so the cases are
 * that it is set, changed and cleared; that a task made in the notebook without
 * saying otherwise takes it and one that says "none" does not; that it is only
 * ever one of the account's own categories, including for somebody writing in
 * a notebook shared with them; and that deleting the category or moving the
 * account keeps it pointing at the right thing.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const OUTSIDER = 'not-on-the-plan-either';

let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let notebooks: typeof import('../src/lib/services/notebooks');
let activities: typeof import('../src/lib/services/activities');
let todos: typeof import('../src/lib/services/todos');
let account: typeof import('../src/lib/server/services/account');
let accountImport: typeof import('../src/lib/server/services/account-import');
let NotFoundError: typeof import('../src/lib/services/errors').NotFoundError;
let ctxOf: (id: string) => import('../src/lib/services/ctx').Ctx;

let home: number;
let work: number;
let theirs: number;
let kitchen: number;

beforeAll(async () => {
	process.env.ONTOPLANO_SELF_HOST = 'false';
	subscriptions = await import('../src/lib/server/services/subscriptions');
	notebooks = await import('../src/lib/services/notebooks');
	activities = await import('../src/lib/services/activities');
	todos = await import('../src/lib/services/todos');
	account = await import('../src/lib/server/services/account');
	accountImport = await import('../src/lib/server/services/account-import');
	({ NotFoundError } = await import('../src/lib/services/errors'));
	const { buildCtx } = await import('../src/lib/services/ctx');
	ctxOf = (id) => buildCtx(id, { tz: 'UTC' });

	const { db } = await import('../src/lib/server/db');
	(db as unknown as { $client: import('better-sqlite3').Database }).$client
		.prepare(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'Outsider', 'outsider2@test.invalid', 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`
		)
		.run(OUTSIDER);

	// OWNER pays for a family plan; STRANGER has a seat on it.
	subscriptions.applySubscription(OWNER, {
		plan: 'pro',
		status: 'active',
		provider: 'paddle',
		providerSubscriptionId: 'sub_notebook_category_test',
		currentPeriodEnd: '2126-01-01T00:00:00.000Z',
		seats: 5
	});
	subscriptions.addToPlan(OWNER, 'stranger@test.invalid');
	subscriptions.acceptPlanInvite(STRANGER);

	home = activities.createCategory(ctxOf(OWNER), { name: 'home' });
	work = activities.createCategory(ctxOf(OWNER), { name: 'work' });
	theirs = activities.createCategory(ctxOf(STRANGER), { name: 'theirs' });
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

const categoryOfTodo = (who: string, id: number) =>
	todos.listTodos(ctxOf(who)).find((one) => one.id === id)?.categoryId ?? null;

describe('setting it', () => {
	test('is part of making a notebook, and reads back with its name', () => {
		kitchen = notebooks.createNotebook(ctxOf(OWNER), { title: 'Kitchen', categoryId: home });
		const found = notebooks.getNotebook(ctxOf(OWNER), kitchen);
		expect(found.categoryId).toBe(home);
		expect(found.categoryName).toBe('home');
		expect(
			notebooks.pickableNotebooks(ctxOf(OWNER)).find((one) => one.id === kitchen)?.categoryId
		).toBe(home);
	});

	test('left out of an edit it stays; changed it changes; empty clears it', () => {
		notebooks.updateNotebook(ctxOf(OWNER), kitchen, { title: 'Kitchen' });
		expect(notebooks.getNotebook(ctxOf(OWNER), kitchen).categoryId).toBe(home);

		notebooks.updateNotebook(ctxOf(OWNER), kitchen, { title: 'Kitchen', categoryId: work });
		expect(notebooks.getNotebook(ctxOf(OWNER), kitchen).categoryId).toBe(work);

		notebooks.updateNotebook(ctxOf(OWNER), kitchen, { title: 'Kitchen', categoryId: '' });
		expect(notebooks.getNotebook(ctxOf(OWNER), kitchen).categoryId).toBeNull();

		notebooks.updateNotebook(ctxOf(OWNER), kitchen, { title: 'Kitchen', categoryId: home });
	});

	test('somebody else’s category is a 404, the same as one that does not exist', () => {
		expect(() =>
			notebooks.createNotebook(ctxOf(OWNER), { title: 'Theirs', categoryId: theirs })
		).toThrow(NotFoundError);
		expect(() =>
			notebooks.updateNotebook(ctxOf(OWNER), kitchen, { title: 'Kitchen', categoryId: 999_999 })
		).toThrow(NotFoundError);
		expect(notebooks.getNotebook(ctxOf(OWNER), kitchen).categoryId).toBe(home);
	});
});

describe('a task made in the notebook', () => {
	test('takes its category when it says nothing', () => {
		const id = todos.createTodo(ctxOf(OWNER), { title: 'measure the wall', notebookId: kitchen });
		expect(categoryOfTodo(OWNER, id)).toBe(home);
	});

	test('keeps its own when it says one, and none when it says none', () => {
		const other = todos.createTodo(ctxOf(OWNER), {
			title: 'invoice the client',
			notebookId: kitchen,
			categoryId: work
		});
		expect(categoryOfTodo(OWNER, other)).toBe(work);

		const none = todos.createTodo(ctxOf(OWNER), {
			title: 'think about it',
			notebookId: kitchen,
			categoryId: ''
		});
		expect(categoryOfTodo(OWNER, none)).toBeNull();
	});

	test('in no notebook, takes nothing', () => {
		const id = todos.createTodo(ctxOf(OWNER), { title: 'loose end' });
		expect(categoryOfTodo(OWNER, id)).toBeNull();
	});

	test('by somebody the notebook is shared with, never takes the owner’s category', () => {
		notebooks.setNotebookShared(ctxOf(OWNER), kitchen, true);
		expect(
			notebooks.pickableNotebooks(ctxOf(STRANGER)).find((one) => one.id === kitchen)?.categoryId
		).toBeNull();

		const id = todos.createTodo(ctxOf(STRANGER), { title: 'bring tiles', notebookId: kitchen });
		expect(categoryOfTodo(STRANGER, id)).toBeNull();
		notebooks.setNotebookShared(ctxOf(OWNER), kitchen, false);
	});
});

describe('what happens to it', () => {
	test('deleting the category clears it from the notebook', () => {
		const spare = activities.createCategory(ctxOf(OWNER), { name: 'spare' });
		const shed = notebooks.createNotebook(ctxOf(OWNER), { title: 'Shed', categoryId: spare });
		activities.deleteCategory(ctxOf(OWNER), spare);
		expect(notebooks.getNotebook(ctxOf(OWNER), shed).categoryId).toBeNull();
	});

	test('an export and a restore keep it pointing at the copied category', async () => {
		const file = account.exportAccount(OWNER, new Date('2026-09-01T09:00:00Z'));
		await accountImport.importAccount(OUTSIDER, file);

		const back = notebooks.listNotebooks(ctxOf(OUTSIDER)).find((one) => one.title === 'Kitchen');
		expect(back?.categoryName).toBe('home');
		expect(back?.categoryId).not.toBe(home);
		expect(activities.listCategories(ctxOf(OUTSIDER)).map((one) => one.id)).toContain(
			back?.categoryId
		);
	});
});
