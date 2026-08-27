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
