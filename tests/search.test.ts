/**
 * Search, which is only useful if it finds things across kinds and never finds
 * somebody else's.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let search: typeof import('../src/lib/server/services/search');
let diary: typeof import('../src/lib/server/services/diary');
let shopping: typeof import('../src/lib/server/services/shopping');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	search = await import('../src/lib/server/services/search');
	diary = await import('../src/lib/server/services/diary');
	shopping = await import('../src/lib/server/services/shopping');
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	diary.createEntry(ctx, { content: 'the tiler comes on the third' });
	const pantry = shopping.createCategory(ctx, { name: 'Pantry', isFood: true });
	shopping.createItem(ctx, { name: 'tiles', type: 'replenish', shoppingCategoryId: pantry });

	const stranger = shopping.createCategory(theirs, { name: 'Theirs', isFood: true });
	shopping.createItem(theirs, {
		name: 'tiler secret',
		type: 'replenish',
		shoppingCategoryId: stranger
	});
});

describe('finding things', () => {
	test('across kinds at once', () => {
		const kinds = new Set(search.search(ctx, 'til').map((h) => h.kind));
		expect(kinds.has('entry')).toBe(true);
		expect(kinds.has('shopping')).toBe(true);
	});

	test('a one-letter query is not a search', () => {
		expect(search.search(ctx, 't')).toHaveLength(0);
	});

	test('a wildcard is not a wildcard', () => {
		// `%` would otherwise match everything; it is escaped before the query.
		expect(search.search(ctx, '%%')).toHaveLength(0);
	});

	test('never somebody else’s rows', () => {
		const titles = search.search(ctx, 'tiler').map((h) => h.title);
		expect(titles.join(' ')).not.toContain('secret');
	});

	test('a hit says where it came from', () => {
		const hit = search.search(ctx, 'tiler').find((h) => h.kind === 'entry')!;
		expect(hit.href).toMatch(/^\/notebooks\/diary/);
		expect(hit.snippet.toLowerCase()).toContain('tiler');
	});
});

describe('grouping', () => {
	test('drops kinds with nothing in them', () => {
		const groups = search.grouped(search.search(ctx, 'tiler'));
		expect(groups.every((g) => g.hits.length > 0)).toBe(true);
	});
});

/**
 * LIKE's wildcards, as literal characters.
 *
 * The escaping existed but the query carried no ESCAPE clause, so it did
 * nothing: a search for "100%" matched nothing (the backslash was taken
 * literally) and a bare "%" — three of them, to clear the minimum length —
 * matched every row in the account.
 */
describe('wildcard characters in the query', () => {
	beforeAll(() => {
		diary.createEntry(ctx, { content: 'the sale sign says 100% off' });
		diary.createEntry(ctx, { content: 'renamed the file to under_score' });
	});

	test('a literal % is searchable', () => {
		const hits = search.search(ctx, '100%');
		expect(hits.some((h) => h.snippet?.includes('100%') || h.title?.includes('100%'))).toBe(true);
	});

	test('a literal _ is searchable', () => {
		const hits = search.search(ctx, 'under_score');
		expect(hits.length).toBeGreaterThan(0);
	});

	test('wildcards do not match everything', () => {
		// Three %s pass the minimum length; they must match only rows that
		// contain three literal per-cent signs, of which there are none.
		expect(search.search(ctx, '%%%')).toHaveLength(0);
		expect(search.search(ctx, '___')).toHaveLength(0);
	});
});
