/**
 * The shopping list, whose rules are small and easy to get subtly wrong.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let shopping: typeof import('../src/lib/server/services/shopping');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let pantry: number;

beforeAll(async () => {
	shopping = await import('../src/lib/server/services/shopping');
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	pantry = shopping.createCategory(ctx, { name: 'Pantry', isFood: true });
});

describe('adding', () => {
	test('the same name twice puts it back on the list rather than making a second row', () => {
		shopping.createItem(ctx, { name: 'milk', type: 'replenish', shoppingCategoryId: pantry });
		const item = shopping.listItems(ctx).find((i) => i.name === 'milk')!;
		shopping.toggleBought(ctx, item.id);

		const second = shopping.createItem(ctx, {
			name: 'MILK',
			type: 'replenish',
			shoppingCategoryId: pantry
		});

		expect(second.alreadyHad).toBe(true);
		expect(shopping.listItems(ctx).filter((i) => /milk/i.test(i.name))).toHaveLength(1);
		expect(shopping.listItems(ctx).find((i) => i.id === item.id)!.bought).toBe(false);
	});

	test('a price is read the way people type it', () => {
		shopping.createItem(ctx, {
			name: 'saffron',
			type: 'replenish',
			price: '39,90',
			shoppingCategoryId: pantry
		});
		expect(shopping.listItems(ctx).find((i) => i.name === 'saffron')!.priceCents).toBe(3990);
	});

	test('no price is not a price of zero', () => {
		shopping.createItem(ctx, { name: 'thyme', type: 'replenish', shoppingCategoryId: pantry });
		expect(shopping.listItems(ctx).find((i) => i.name === 'thyme')!.priceCents).toBeNull();
	});
});

describe('categories', () => {
	test('a duplicate name is refused', () => {
		expect(() => shopping.createCategory(ctx, { name: 'pantry' })).toThrow();
	});

	test('the food flag is what recipes read', () => {
		const id = shopping.createCategory(ctx, { name: 'Tech', isFood: false });
		expect(shopping.listCategories(ctx).find((c) => c.id === id)!.isFood).toBe(false);
		shopping.setCategoryFood(ctx, id, true);
		expect(shopping.listCategories(ctx).find((c) => c.id === id)!.isFood).toBe(true);
	});
});

describe('ownership', () => {
	test('another account sees none of it', () => {
		expect(shopping.listItems(theirs)).toHaveLength(0);
	});

	test('and cannot delete a row it does not own', () => {
		const item = shopping.listItems(ctx)[0];
		expect(() => shopping.deleteItem(theirs, item.id)).toThrow();
	});
});

describe('what you actually paid', () => {
	test('a tick with no number records nothing', () => {
		shopping.createItem(ctx, { name: 'bread', type: 'replenish' });
		const id = shopping.listItems(ctx).find((i) => i.name === 'bread')!.id;
		shopping.toggleBought(ctx, id);

		expect(shopping.priceHistory(ctx, id)).toEqual([]);
	});

	test('a tick with a number records it, and updates the "about"', () => {
		shopping.createItem(ctx, { name: 'oat milk', type: 'replenish' });
		const id = shopping.listItems(ctx).find((i) => i.name === 'oat milk')!.id;
		shopping.toggleBought(ctx, id, { paid: '1.20' });

		expect(shopping.priceHistory(ctx, id)).toEqual([{ priceCents: 120, forDate: '2026-08-26' }]);
		expect(shopping.listItems(ctx).find((i) => i.id === id)?.priceCents).toBe(120);
	});

	test('unticking records nothing — you did not buy it twice', () => {
		shopping.createItem(ctx, { name: 'butter', type: 'replenish' });
		const id = shopping.listItems(ctx).find((i) => i.name === 'butter')!.id;
		shopping.toggleBought(ctx, id, { paid: '2.00' });
		shopping.toggleBought(ctx, id, { paid: '9.99' });

		expect(shopping.priceHistory(ctx, id)).toHaveLength(1);
	});

	test('the drift needs two prices before it says anything', () => {
		shopping.createItem(ctx, { name: 'coffee', type: 'replenish' });
		const id = shopping.listItems(ctx).find((i) => i.name === 'coffee')!.id;
		shopping.toggleBought(ctx, id, { paid: '4.00' });
		expect(shopping.priceDrift(ctx, id)).toBeNull();

		shopping.toggleBought(ctx, id);
		shopping.toggleBought(ctx, id, { paid: '5.00' });

		const drift = shopping.priceDrift(ctx, id)!;
		expect(drift.from.priceCents).toBe(400);
		expect(drift.to.priceCents).toBe(500);
		expect(drift.percent).toBe(25);
	});

	test('a falling price reads as a fall', () => {
		shopping.createItem(ctx, { name: 'flour', type: 'replenish' });
		const id = shopping.listItems(ctx).find((i) => i.name === 'flour')!.id;
		shopping.toggleBought(ctx, id, { paid: '2.00' });
		shopping.toggleBought(ctx, id);
		shopping.toggleBought(ctx, id, { paid: '1.50' });

		expect(shopping.priceDrift(ctx, id)!.percent).toBe(-25);
	});

	test("a stranger cannot read another account's prices", () => {
		shopping.createItem(ctx, { name: 'saffron', type: 'replenish' });
		const id = shopping.listItems(ctx).find((i) => i.name === 'saffron')!.id;
		shopping.toggleBought(ctx, id, { paid: '12.00' });

		expect(() => shopping.priceHistory(theirs, id)).toThrow();
	});
});
