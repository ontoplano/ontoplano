/**
 * The export, put back.
 *
 * An export that cannot be imported is a souvenir, not a way out — the promise
 * on the front page is that you can walk away with your data, and walking away
 * with it means arriving somewhere else with it.
 *
 * The case that matters is the ids. Every app table has an autoincrement
 * primary key and the rows point at each other with it, so id 7 in the file is
 * somebody else's row in the database being imported into. The rows have to be
 * renumbered on the way in and every reference rewritten to match, or a week
 * comes back attached to the wrong things — which looks like it worked.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let account: typeof import('../src/lib/server/services/account');
let accountImport: typeof import('../src/lib/server/services/account-import');
let activities: typeof import('../src/lib/server/services/activities');
let todos: typeof import('../src/lib/server/services/todos');
let shopping: typeof import('../src/lib/server/services/shopping');
let ctx: typeof import('../src/lib/server/services/ctx');

const now = new Date('2026-09-01T09:00:00Z');

beforeAll(async () => {
	account = await import('../src/lib/server/services/account');
	accountImport = await import('../src/lib/server/services/account-import');
	activities = await import('../src/lib/server/services/activities');
	todos = await import('../src/lib/server/services/todos');
	shopping = await import('../src/lib/server/services/shopping');
	ctx = await import('../src/lib/server/services/ctx');
});

const owner = () => ctx.buildCtx(OWNER);
const stranger = () => ctx.buildCtx(STRANGER);

describe('a round trip', () => {
	let file: ReturnType<typeof account.exportAccount>;

	beforeAll(() => {
		// A category, an activity that points at it, and a todo that points at
		// the category: three tables and two references between them, which is
		// the whole of what the renumbering has to get right.
		const cat = activities.createCategory(owner(), { name: 'garden', color: '#0f766e' });
		activities.createActivity(owner(), { name: 'weeding', categoryId: cat });
		todos.createTodo(owner(), { title: 'buy compost', categoryId: cat });

		const list = shopping.createCategory(owner(), { name: 'outdoors' });
		shopping.createItem(owner(), { name: 'twine', shoppingCategoryId: list, type: 'replenish' });

		file = account.exportAccount(OWNER, now);
	});

	test('lands everything in the other account', () => {
		const result = accountImport.importAccount(STRANGER, file);

		expect(result.total).toBeGreaterThan(0);
		expect(activities.listCategories(stranger()).map((c) => c.name)).toContain('garden');
		expect(todos.listUnscheduled(stranger()).map((t) => t.title)).toContain('buy compost');
	});

	test('and the references point at the imported rows, not the old ids', () => {
		// The failure this catches: keeping the old number. It would still be a
		// valid id — somebody else's — so nothing errors and the activity comes
		// back under the wrong category.
		const cats = activities.listCategories(stranger());
		const garden = cats.find((c) => c.name === 'garden');
		expect(garden).toBeTruthy();

		const weeding = activities.listActivities(stranger()).find((a) => a.name === 'weeding');
		expect(weeding?.categoryId).toBe(garden!.id);

		const compost = todos.listUnscheduled(stranger()).find((t) => t.title === 'buy compost');
		expect(compost?.categoryId).toBe(garden!.id);
	});

	test('every row belongs to the account that imported it', () => {
		// The one mistake that would be a security bug rather than a nuisance.
		const theirs = account.exportAccount(STRANGER, new Date(now.getTime() + 1000));
		for (const rows of Object.values(theirs.data)) {
			for (const row of rows as Record<string, unknown>[]) {
				if ('userId' in row) expect(row.userId).toBe(STRANGER);
			}
		}
	});

	test('replaces rather than merges: importing twice is not two copies', () => {
		accountImport.importAccount(STRANGER, file);
		const gardens = activities.listCategories(stranger()).filter((c) => c.name === 'garden');
		expect(gardens).toHaveLength(1);
	});

	test('and the account it came from still has everything', () => {
		expect(activities.listCategories(owner()).map((c) => c.name)).toContain('garden');
	});
});

describe('what does not travel', () => {
	test('billing is dropped, and said so', () => {
		const file = {
			exportedAt: now.toISOString(),
			account: { id: 'x', name: 'x', email: 'someone@example.test' },
			data: {
				subscriptions: [{ id: 1, userId: 'x', plan: 'pro', status: 'active', provider: 'paddle' }],
				apiTokens: [{ id: 1, userId: 'x', name: 'a token', tokenHash: 'deadbeef' }]
			}
		};

		const result = accountImport.importAccount(STRANGER, file);
		const names = result.skipped.map((s) => s.name);
		expect(names).toContain('subscriptions');
		expect(names).toContain('apiTokens');
		// And every skip says why, because "some things were skipped" is not an
		// answer somebody can act on.
		for (const skip of result.skipped) expect(skip.why.length).toBeGreaterThan(10);
	});

	test('a table this version has never heard of is reported, not refused', () => {
		const result = accountImport.importAccount(STRANGER, {
			exportedAt: now.toISOString(),
			account: { id: 'x', name: 'x', email: 'a@b.test' },
			data: { beliefs: [{ id: 1, userId: 'x' }] }
		});

		expect(result.skipped.find((s) => s.name === 'beliefs')?.why).toMatch(/no such table/);
	});
});

describe('a file that is not an export', () => {
	test('is refused with a sentence, not a stack trace', () => {
		expect(() => accountImport.parseExport('not json at all {')).toThrow(/not JSON/i);
		expect(() => accountImport.parseExport('[]')).toThrow(/not an ontoplano export/i);
		expect(() => accountImport.parseExport('{}')).toThrow(/no account data/i);
		expect(() => accountImport.parseExport('{"data":{"todoTasks":"nope"}}')).toThrow(
			/not a list of rows/i
		);
	});

	/**
	 * A file somebody made rather than exported.
	 *
	 * This is the one screen where a stranger's file is read by the server, so
	 * the ceilings are the interesting part: not what a real export contains,
	 * but what a made-up one is stopped from costing.
	 */
	test("is refused when it is too big to be anybody's data", () => {
		const huge = `{"data":{"todoTasks":[${'{},'.repeat(200_001).slice(0, -1)}]}}`;
		expect(() => accountImport.parseExport(huge)).toThrow(/most one restore may carry/i);

		expect(() => accountImport.parseExport('x'.repeat(20_000_001))).toThrow(/too big/i);
	});

	test('drops a value no column can hold rather than failing mid-restore', () => {
		const before = todos.listUnscheduled(stranger()).length;

		accountImport.importAccount(STRANGER, {
			exportedAt: '2026-09-01',
			account: { id: OWNER, name: 'x', email: 'x@test.invalid' },
			data: {
				notebooks: [{ id: 1, title: 'Kept', description: { nested: 'not a column value' } }],
				todoTasks: [
					{ id: 1, title: 'A'.repeat(400_000), notebookId: 1, status: 'todo' },
					{ id: 2, title: 'Fine', notebookId: 1, status: 'todo', notes: ['also', 'not'] }
				]
			}
		});

		const after = todos.listUnscheduled(stranger());
		expect(after.length).toBeGreaterThan(before);
		// The long one landed, cut to a length a column can hold, rather than
		// taking the whole transaction down with it.
		expect(after.some((t) => t.title.startsWith('AAAA'))).toBe(true);
		expect(after.some((t) => t.title === 'Fine')).toBe(true);
	});
});
