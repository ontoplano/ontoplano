/**
 * Starred notebooks: first on the shelf and in every picker, and the reader's own.
 *
 * A star is a row per reader rather than a column on the notebook, because a
 * notebook shared into the family is seen by several people and which ones
 * each of them reaches for is their answer, not the owner's. So the cases that
 * matter are whose star it is, who may put one on, and what happens to it when
 * the notebook goes — and on a restore, a star on a notebook that was never in
 * the file.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const OUTSIDER = 'not-on-the-plan';

let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let notebooks: typeof import('../src/lib/services/notebooks');
let account: typeof import('../src/lib/server/services/account');
let accountImport: typeof import('../src/lib/server/services/account-import');
let NotFoundError: typeof import('../src/lib/services/errors').NotFoundError;
let ctxOf: (id: string) => import('../src/lib/services/ctx').Ctx;

let reading: number;
let kitchen: number;
let lisbon: number;

beforeAll(async () => {
	process.env.ONTOPLANO_SELF_HOST = 'false';
	subscriptions = await import('../src/lib/server/services/subscriptions');
	notebooks = await import('../src/lib/services/notebooks');
	account = await import('../src/lib/server/services/account');
	accountImport = await import('../src/lib/server/services/account-import');
	({ NotFoundError } = await import('../src/lib/services/errors'));
	const { buildCtx } = await import('../src/lib/services/ctx');
	ctxOf = (id) => buildCtx(id, { tz: 'UTC' });

	const { db } = await import('../src/lib/server/db');
	(db as unknown as { $client: import('better-sqlite3').Database }).$client
		.prepare(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'Outsider', 'outsider@test.invalid', 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`
		)
		.run(OUTSIDER);

	// OWNER pays for a family plan; STRANGER has a seat on it.
	subscriptions.applySubscription(OWNER, {
		plan: 'pro',
		status: 'active',
		provider: 'paddle',
		providerSubscriptionId: 'sub_favourites_test',
		currentPeriodEnd: '2126-01-01T00:00:00.000Z',
		seats: 5
	});
	subscriptions.addToPlan(OWNER, 'stranger@test.invalid');
	subscriptions.acceptPlanInvite(STRANGER);

	const owner = ctxOf(OWNER);
	reading = notebooks.createNotebook(owner, { title: 'Reading' });
	kitchen = notebooks.createNotebook(owner, { title: 'Kitchen', folder: 'Home' });
	lisbon = notebooks.createNotebook(owner, { title: 'Lisbon', folder: 'Trips' });
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

const ids = (id: string) => notebooks.listNotebooks(ctxOf(id)).map((n) => n.id);
const pickable = (id: string) => notebooks.pickableNotebooks(ctxOf(id)).map((n) => n.id);
const starred = (id: string) =>
	notebooks
		.listNotebooks(ctxOf(id))
		.filter((n) => n.favourite)
		.map((n) => n.id);

describe('starring your own', () => {
	test('puts it first on the shelf and in the pickers, keeping its folder', () => {
		// By path: the top of the shelf, then each folder.
		expect(ids(OWNER)).toEqual([reading, kitchen, lisbon]);

		notebooks.setNotebookFavourite(ctxOf(OWNER), lisbon, true);

		expect(ids(OWNER)).toEqual([lisbon, reading, kitchen]);
		expect(pickable(OWNER)).toEqual([lisbon, reading, kitchen]);
		const found = notebooks.getNotebook(ctxOf(OWNER), lisbon);
		expect(found.favourite).toBe(true);
		expect(found.folder).toBe('Trips');
	});

	test('twice is one star, and taking it off puts it back in its place', () => {
		notebooks.setNotebookFavourite(ctxOf(OWNER), lisbon, true);
		expect(starred(OWNER)).toEqual([lisbon]);

		notebooks.setNotebookFavourite(ctxOf(OWNER), lisbon, false);
		expect(starred(OWNER)).toEqual([]);
		expect(ids(OWNER)).toEqual([reading, kitchen, lisbon]);
	});

	test('a closed one keeps its star and stays at the back', () => {
		notebooks.setNotebookFavourite(ctxOf(OWNER), reading, true);
		notebooks.setNotebookClosed(ctxOf(OWNER), reading, true);

		expect(ids(OWNER)).toEqual([kitchen, lisbon, reading]);
		expect(starred(OWNER)).toEqual([reading]);

		notebooks.setNotebookClosed(ctxOf(OWNER), reading, false);
		expect(ids(OWNER)[0]).toBe(reading);
		notebooks.setNotebookFavourite(ctxOf(OWNER), reading, false);
	});
});

describe('whose star it is', () => {
	test('somebody else’s notebook is a 404, the same as one that does not exist', () => {
		expect(() => notebooks.setNotebookFavourite(ctxOf(OUTSIDER), kitchen, true)).toThrow(
			NotFoundError
		);
		expect(() => notebooks.setNotebookFavourite(ctxOf(OUTSIDER), 999_999, true)).toThrow(
			NotFoundError
		);
		// Nor before it is shared, for a member of the plan.
		expect(() => notebooks.setNotebookFavourite(ctxOf(STRANGER), kitchen, true)).toThrow(
			NotFoundError
		);
	});

	test('a notebook shared into the family can be starred by the reader, for the reader', () => {
		notebooks.setNotebookShared(ctxOf(OWNER), kitchen, true);
		notebooks.setNotebookFavourite(ctxOf(STRANGER), kitchen, true);

		expect(starred(STRANGER)).toEqual([kitchen]);
		expect(pickable(STRANGER)[0]).toBe(kitchen);
		// The owner's shelf is the owner's.
		expect(starred(OWNER)).toEqual([]);
	});

	test('the owner taking their own star off leaves the reader’s', () => {
		notebooks.setNotebookFavourite(ctxOf(OWNER), kitchen, true);
		notebooks.setNotebookFavourite(ctxOf(OWNER), kitchen, false);
		expect(starred(STRANGER)).toEqual([kitchen]);
	});

	test('deleting the notebook takes every star on it with it', () => {
		const shed = notebooks.createNotebook(ctxOf(OWNER), { title: 'Shed' });
		notebooks.setNotebookShared(ctxOf(OWNER), shed, true);
		notebooks.setNotebookFavourite(ctxOf(OWNER), shed, true);
		notebooks.setNotebookFavourite(ctxOf(STRANGER), shed, true);

		notebooks.deleteNotebook(ctxOf(OWNER), shed);

		expect(starred(OWNER)).not.toContain(shed);
		expect(starred(STRANGER)).not.toContain(shed);
	});
});

describe('the export', () => {
	test('carries the stars, and a restore drops one on a notebook the file does not have', async () => {
		notebooks.setNotebookFavourite(ctxOf(OWNER), lisbon, true);
		const own = account.exportAccount(OWNER, new Date('2026-09-01T09:00:00Z'));
		expect(own.data.notebookFavourites).toHaveLength(1);

		// STRANGER's star is on OWNER's kitchen, which is not in STRANGER's file.
		const theirs = account.exportAccount(STRANGER, new Date('2026-09-01T09:00:00Z'));
		expect(theirs.data.notebookFavourites).toHaveLength(1);
		const result = await accountImport.importAccount(OUTSIDER, theirs);
		expect(result.skipped.find((s) => s.name === 'notebookFavourites')?.rows).toBe(1);

		// And one on a notebook the file does have comes back pointing at the copy.
		await accountImport.importAccount(OUTSIDER, own);
		const back = notebooks.listNotebooks(ctxOf(OUTSIDER));
		expect(back.filter((n) => n.favourite).map((n) => n.title)).toEqual(['Lisbon']);
	});
});
