/**
 * The list you take to the shop.
 *
 * It is a reading of the cupboard rather than a thing anybody maintains, so
 * what it says has to follow from what is in there: something is on it when
 * there is less of it than you keep, it is off it the moment there is enough,
 * and the total is honest about the lines it could not price.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Shopping = typeof import('../src/lib/services/shopping');
let s: Shopping;
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	s = await import('../src/lib/services/shopping');
	ctx = { userId: OWNER, now: new Date('2026-09-14T09:00:00Z'), tz: 'UTC' };
});

/** A replenish item with nothing in the cupboard yet, and its id. */
function keep(name: string, idealQty: number, price?: string): number {
	s.createItem(ctx, { name, type: 'replenish', idealQty, price });
	return s.shoppingRun(ctx).lines.find((line) => line.name === name)!.id;
}

describe('the shopping run', () => {
	test('lists what has run low, with how many and what it costs', () => {
		keep('Tinned tomatoes', 4, '2.50');
		keep('Olive oil', 1, '9.00');

		const run = s.shoppingRun(ctx);
		const tomatoes = run.lines.find((line) => line.name === 'Tinned tomatoes')!;
		expect(tomatoes.needed).toBe(4);
		expect(tomatoes.lineCents).toBe(1000);
		// Four tins and one bottle: the total is the lines, not the prices.
		expect(run.totalCents).toBe(1900);
		expect(run.unpriced).toBe(0);
	});

	test('a full cupboard is not a shopping list', () => {
		const id = keep('Rice', 2, '1.00');
		s.setQty(ctx, id, 2);
		expect(s.shoppingRun(ctx).lines.some((line) => line.name === 'Rice')).toBe(false);
	});

	test('only the shortfall is bought, not the whole shelf', () => {
		const id = keep('Coffee', 3, '7.00');
		s.setQty(ctx, id, 1);
		const line = s.shoppingRun(ctx).lines.find((l) => l.name === 'Coffee')!;
		expect(line.needed).toBe(2);
		expect(line.lineCents).toBe(1400);
	});

	test('an unpriced line is counted, and never counted as free', () => {
		const before = s.shoppingRun(ctx).totalCents;
		keep('Bread', 1);
		const run = s.shoppingRun(ctx);
		expect(run.unpriced).toBeGreaterThan(0);
		expect(run.totalCents).toBe(before);
	});

	test('the wishlist is beside the trip, not inside its total', () => {
		const before = s.shoppingRun(ctx).totalCents;
		s.createItem(ctx, { name: 'A better pan', type: 'someday', price: '80.00' });

		const run = s.shoppingRun(ctx);
		expect(run.totalCents).toBe(before);
		expect(run.wishlist.map((w) => w.name)).toContain('A better pan');
		expect(run.lines.some((line) => line.name === 'A better pan')).toBe(false);
	});
});
