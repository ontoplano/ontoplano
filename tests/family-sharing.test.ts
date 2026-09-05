/**
 * Share with the family — a shopping section, a notebook — and no further.
 *
 * The one rule everything here re-states: sharing widens who may REACH a
 * thing, never who OWNS it. A member of the plan sees the shared section and
 * fills it, reads the shared notebook and writes their own entries; an
 * account outside the plan gets exactly what it always got, which is nothing;
 * and the switches — share, rename, delete, the food flag — answer only to
 * the owner.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const OUTSIDER = 'not-on-the-plan';

let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let shopping: typeof import('../src/lib/server/services/shopping');
let notebooks: typeof import('../src/lib/server/services/notebooks');
let diary: typeof import('../src/lib/server/services/diary');
let ctxOf: (id: string) => import('../src/lib/server/services/ctx').Ctx;

beforeAll(async () => {
	process.env.ONTOPLANO_SELF_HOST = 'false';
	subscriptions = await import('../src/lib/server/services/subscriptions');
	shopping = await import('../src/lib/server/services/shopping');
	notebooks = await import('../src/lib/server/services/notebooks');
	diary = await import('../src/lib/server/services/diary');
	const { buildCtx } = await import('../src/lib/server/services/ctx');
	ctxOf = (id) => buildCtx(id, { tz: 'UTC' });

	// A third account, on nobody's plan.
	const { db } = await import('../src/lib/server/db');
	db.$client
		.prepare(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'Outsider', 'outsider@test.invalid', 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`
		)
		.run(OUTSIDER);

	// OWNER pays for a family plan; STRANGER sits on one of its seats.
	subscriptions.applySubscription(OWNER, {
		plan: 'pro',
		status: 'active',
		provider: 'paddle',
		providerSubscriptionId: 'sub_sharing_test',
		currentPeriodEnd: '2126-01-01T00:00:00.000Z',
		seats: 5
	});
	subscriptions.addToPlan(OWNER, 'stranger@test.invalid');
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

describe('the family circle', () => {
	test('is the payer and the seats, from either end — and one alone for an outsider', () => {
		expect(subscriptions.familyUserIds(OWNER).sort()).toEqual([STRANGER, OWNER].sort());
		expect(subscriptions.familyUserIds(STRANGER).sort()).toEqual([STRANGER, OWNER].sort());
		expect(subscriptions.familyUserIds(OUTSIDER)).toEqual([OUTSIDER]);
	});
});

describe('a shared shopping section', () => {
	let sectionId: number;

	test('appears on the family member’s list once shared, and not before', () => {
		sectionId = shopping.createCategory(ctxOf(OWNER), { name: 'Household', isFood: true });
		expect(shopping.listCategories(ctxOf(STRANGER)).map((c) => c.id)).not.toContain(sectionId);

		shopping.setCategoryShared(ctxOf(OWNER), sectionId, true);
		const seen = shopping.listCategories(ctxOf(STRANGER)).find((c) => c.id === sectionId);
		expect(seen).toBeTruthy();
		expect(seen!.mine).toBe(false);

		// And never on an outsider's.
		expect(shopping.listCategories(ctxOf(OUTSIDER)).map((c) => c.id)).not.toContain(sectionId);
	});

	test('lets the member add milk on their phone and tick it on the owner’s', () => {
		shopping.createItem(ctxOf(STRANGER), {
			name: 'milk',
			type: 'replenish',
			shoppingCategoryId: sectionId
		});

		const onOwners = shopping.listItems(ctxOf(OWNER)).find((i) => i.name === 'milk');
		expect(onOwners, 'the member’s milk reaches the owner’s list').toBeTruthy();
		expect(onOwners!.mine).toBe(false);

		shopping.setBought(ctxOf(OWNER), onOwners!.id, true);
		const back = shopping.listItems(ctxOf(STRANGER)).find((i) => i.id === onOwners!.id);
		expect(back!.bought, 'ticked in the aisle, bought on both').toBe(true);
	});

	test('keeps every switch the owner’s: rename, food, share, delete', () => {
		const theirs = ctxOf(STRANGER);
		expect(() => shopping.renameCategory(theirs, sectionId, 'Hijacked')).toThrow();
		expect(() => shopping.setCategoryFood(theirs, sectionId, false)).toThrow();
		expect(() => shopping.setCategoryShared(theirs, sectionId, false)).toThrow();
		expect(() => shopping.deleteCategory(theirs, sectionId)).toThrow();
	});

	test('shows an outsider nothing, not even by id', () => {
		const milk = shopping.listItems(ctxOf(OWNER)).find((i) => i.name === 'milk')!;
		expect(() => shopping.setBought(ctxOf(OUTSIDER), milk.id, false)).toThrow();
	});

	test('goes quiet again when the owner stops sharing — own rows stay your own', () => {
		shopping.setCategoryShared(ctxOf(OWNER), sectionId, false);
		expect(shopping.listCategories(ctxOf(STRANGER)).map((c) => c.id)).not.toContain(sectionId);
		// The milk row is the member's — their writing stays on their list —
		// but nothing of the owner's reaches them any more.
		expect(shopping.listItems(ctxOf(STRANGER)).some((i) => i.name === 'milk' && i.mine)).toBe(true);
		expect(shopping.listItems(ctxOf(STRANGER)).some((i) => !i.mine)).toBe(false);
	});
});

describe('a shared notebook', () => {
	let notebookId: number;

	test('is readable by the family once shared, wearing its owner’s name', () => {
		notebookId = notebooks.createNotebook(ctxOf(OWNER), { title: 'The move' });
		expect(() => notebooks.getNotebook(ctxOf(STRANGER), notebookId)).toThrow();

		notebooks.setNotebookShared(ctxOf(OWNER), notebookId, true);
		const seen = notebooks.getNotebook(ctxOf(STRANGER), notebookId);
		expect(seen.mine).toBe(false);
		expect(seen.sharedBy).toBe('Owner');

		expect(() => notebooks.getNotebook(ctxOf(OUTSIDER), notebookId)).toThrow();
	});

	test('takes entries from both, each keeping its writer', () => {
		diary.createEntry(ctxOf(OWNER), { content: 'Boxes ordered.', notebookId });
		diary.createEntry(ctxOf(STRANGER), { content: 'Van booked for the 12th.', notebookId });

		const owners = notebooks.contentsOf(ctxOf(OWNER), notebookId).entries;
		expect(owners.map((e) => e.content).sort()).toEqual(
			['Boxes ordered.', 'Van booked for the 12th.'].sort()
		);
		const theirVan = owners.find((e) => e.content.startsWith('Van'))!;
		expect(theirVan.mine).toBe(false);
		expect(theirVan.author).toBe('Stranger');

		// The member reads both too, and their own row is theirs.
		const members = notebooks.contentsOf(ctxOf(STRANGER), notebookId).entries;
		expect(members.find((e) => e.content.startsWith('Van'))!.mine).toBe(true);
	});

	test('shares the writing, not the notebook’s switches', () => {
		expect(() =>
			notebooks.updateNotebook(ctxOf(STRANGER), notebookId, { title: 'Hijacked' })
		).toThrow();
		expect(() => notebooks.setNotebookShared(ctxOf(STRANGER), notebookId, false)).toThrow();
		expect(() => notebooks.deleteNotebook(ctxOf(STRANGER), notebookId)).toThrow();
	});

	test('goes quiet again when the owner stops sharing', () => {
		notebooks.setNotebookShared(ctxOf(OWNER), notebookId, false);
		expect(() => notebooks.contentsOf(ctxOf(STRANGER), notebookId)).toThrow();
		expect(notebooks.listNotebooks(ctxOf(STRANGER)).some((n) => n.id === notebookId)).toBe(false);
	});
});
