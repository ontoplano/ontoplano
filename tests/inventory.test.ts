/**
 * The shopping list, whose rules are small and easy to get subtly wrong.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let inventory: typeof import('../src/lib/services/inventory');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let pantry: number;

beforeAll(async () => {
	inventory = await import('../src/lib/services/inventory');
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	pantry = inventory.createCategory(ctx, { name: 'Pantry', isFood: true });
});

describe('adding', () => {
	test('the same name twice puts it back on the list rather than making a second row', () => {
		inventory.createItem(ctx, { name: 'milk', type: 'replenish', inventoryCategoryId: pantry });
		const item = inventory.listItems(ctx).find((i) => i.name === 'milk')!;
		inventory.toggleBought(ctx, item.id);

		const second = inventory.createItem(ctx, {
			name: 'MILK',
			type: 'replenish',
			inventoryCategoryId: pantry
		});

		expect(second.alreadyHad).toBe(true);
		expect(inventory.listItems(ctx).filter((i) => /milk/i.test(i.name))).toHaveLength(1);
		expect(inventory.listItems(ctx).find((i) => i.id === item.id)!.bought).toBe(false);
	});

	test('a price is read the way people type it', () => {
		inventory.createItem(ctx, {
			name: 'saffron',
			type: 'replenish',
			price: '39,90',
			inventoryCategoryId: pantry
		});
		expect(inventory.listItems(ctx).find((i) => i.name === 'saffron')!.priceCents).toBe(3990);
	});

	test('no price is not a price of zero', () => {
		inventory.createItem(ctx, { name: 'thyme', type: 'replenish', inventoryCategoryId: pantry });
		expect(inventory.listItems(ctx).find((i) => i.name === 'thyme')!.priceCents).toBeNull();
	});
});

describe('categories', () => {
	test('a duplicate name is refused', () => {
		expect(() => inventory.createCategory(ctx, { name: 'pantry' })).toThrow();
	});

	test('the food flag is what recipes read', () => {
		const id = inventory.createCategory(ctx, { name: 'Tech', isFood: false });
		expect(inventory.listCategories(ctx).find((c) => c.id === id)!.isFood).toBe(false);
		inventory.setCategoryFood(ctx, id, true);
		expect(inventory.listCategories(ctx).find((c) => c.id === id)!.isFood).toBe(true);
	});

	test('a colour is set, checked, and taken off again', () => {
		inventory.setCategoryColor(ctx, pantry, '#aabbcc');
		expect(inventory.listCategories(ctx).find((c) => c.id === pantry)!.color).toBe('#aabbcc');
		expect(() => inventory.setCategoryColor(ctx, pantry, 'red; x:')).toThrow();
		inventory.setCategoryColor(ctx, pantry, '');
		expect(inventory.listCategories(ctx).find((c) => c.id === pantry)!.color).toBeNull();
	});

	test('moves one place at a time, and stops at either end', () => {
		const names = () => inventory.listCategories(ctx).map((c) => c.name);
		const before = names();
		const last = inventory.listCategories(ctx).at(-1)!;
		inventory.moveCategory(ctx, last.id, -1);
		expect(names().at(-2)).toBe(last.name);
		inventory.moveCategory(ctx, last.id, 1);
		expect(names()).toEqual(before);
		inventory.moveCategory(ctx, last.id, 1);
		expect(names()).toEqual(before);
	});

	test('a stranger can neither colour nor move one, and it does not change', () => {
		const before = inventory.listCategories(ctx);
		expect(() => inventory.setCategoryColor(theirs, pantry, '#000000')).toThrow(/not found/i);
		expect(() => inventory.moveCategory(theirs, pantry, 1)).toThrow(/not found/i);
		expect(inventory.listCategories(ctx)).toEqual(before);
	});
});

describe('ownership', () => {
	test('another account sees none of it', () => {
		expect(inventory.listItems(theirs)).toHaveLength(0);
	});

	test('and cannot delete a row it does not own', () => {
		const item = inventory.listItems(ctx)[0];
		expect(() => inventory.deleteItem(theirs, item.id)).toThrow();
	});
});

describe('what you actually paid', () => {
	test('a tick with no number records nothing', () => {
		inventory.createItem(ctx, { name: 'bread', type: 'replenish' });
		const id = inventory.listItems(ctx).find((i) => i.name === 'bread')!.id;
		inventory.toggleBought(ctx, id);

		expect(inventory.priceHistory(ctx, id)).toEqual([]);
	});

	test('a tick with a number records it, and updates the "about"', () => {
		inventory.createItem(ctx, { name: 'oat milk', type: 'replenish' });
		const id = inventory.listItems(ctx).find((i) => i.name === 'oat milk')!.id;
		inventory.toggleBought(ctx, id, { paid: '1.20' });

		expect(inventory.priceHistory(ctx, id)).toEqual([{ priceCents: 120, forDate: '2026-08-26' }]);
		expect(inventory.listItems(ctx).find((i) => i.id === id)?.priceCents).toBe(120);
	});

	test('unticking records nothing — you did not buy it twice', () => {
		inventory.createItem(ctx, { name: 'butter', type: 'replenish' });
		const id = inventory.listItems(ctx).find((i) => i.name === 'butter')!.id;
		inventory.toggleBought(ctx, id, { paid: '2.00' });
		inventory.toggleBought(ctx, id, { paid: '9.99' });

		expect(inventory.priceHistory(ctx, id)).toHaveLength(1);
	});

	test('the drift needs two prices before it says anything', () => {
		inventory.createItem(ctx, { name: 'coffee', type: 'replenish' });
		const id = inventory.listItems(ctx).find((i) => i.name === 'coffee')!.id;
		inventory.toggleBought(ctx, id, { paid: '4.00' });
		expect(inventory.priceDrift(ctx, id)).toBeNull();

		inventory.toggleBought(ctx, id);
		inventory.toggleBought(ctx, id, { paid: '5.00' });

		const drift = inventory.priceDrift(ctx, id)!;
		expect(drift.from.priceCents).toBe(400);
		expect(drift.to.priceCents).toBe(500);
		expect(drift.percent).toBe(25);
	});

	test('a falling price reads as a fall', () => {
		inventory.createItem(ctx, { name: 'flour', type: 'replenish' });
		const id = inventory.listItems(ctx).find((i) => i.name === 'flour')!.id;
		inventory.toggleBought(ctx, id, { paid: '2.00' });
		inventory.toggleBought(ctx, id);
		inventory.toggleBought(ctx, id, { paid: '1.50' });

		expect(inventory.priceDrift(ctx, id)!.percent).toBe(-25);
	});

	test("a stranger cannot read another account's prices", () => {
		inventory.createItem(ctx, { name: 'saffron', type: 'replenish' });
		const id = inventory.listItems(ctx).find((i) => i.name === 'saffron')!.id;
		inventory.toggleBought(ctx, id, { paid: '12.00' });

		expect(() => inventory.priceHistory(theirs, id)).toThrow();
	});
});
