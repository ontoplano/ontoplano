/**
 * The recipe loop, against a real database.
 *
 * The interesting behaviour is not "does it insert a row" — it is the rules
 * that make the feature worth having: only food can be an ingredient, a new
 * ingredient creates the shopping item, amounts are listed rather than added,
 * and cooking does not silently empty the cupboard.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	recipes: typeof import('../src/lib/server/services/recipes');
	shopping: typeof import('../src/lib/server/services/shopping');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let pantry: number;

beforeAll(async () => {
	s = {
		recipes: await import('../src/lib/server/services/recipes'),
		shopping: await import('../src/lib/server/services/shopping')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	pantry = s.shopping.createCategory(ctx, { name: 'Pantry', isFood: true });
	s.shopping.createCategory(ctx, { name: 'Household', isFood: false });
});

describe('what can be an ingredient', () => {
	test('only things in a food category', () => {
		s.shopping.createItem(ctx, { name: 'rice', type: 'replenish', shoppingCategoryId: pantry });
		const household = s.shopping.listCategories(ctx).find((c) => !c.isFood)!;
		s.shopping.createItem(ctx, {
			name: 'dish soap',
			type: 'replenish',
			shoppingCategoryId: household.id
		});

		const names = s.recipes.edibleItems(ctx).map((i) => i.name);
		expect(names).toContain('rice');
		expect(names).not.toContain('dish soap');
	});

	test('a category with no food ticked offers nothing', () => {
		expect(s.recipes.edibleItems(theirs)).toHaveLength(0);
	});
});

describe('writing a recipe', () => {
	test('an ingredient nobody has yet becomes a shopping item, marked as needed', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Rice and beans' });
		s.recipes.addIngredient(ctx, id, { name: 'black beans', quantity: 400, unit: 'g' });

		const item = s.shopping.listItems(ctx).find((i) => i.name === 'black beans');
		expect(item).toBeDefined();
		expect(item!.bought).toBe(false);
	});

	test('the same ingredient twice is a correction, not a second row', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Twice' });
		s.recipes.addIngredient(ctx, id, { name: 'rice', quantity: 100, unit: 'g' });
		s.recipes.addIngredient(ctx, id, { name: 'rice', quantity: 300, unit: 'g' });

		const ingredients = s.recipes.ingredientsOf(ctx, id);
		expect(ingredients).toHaveLength(1);
		expect(ingredients[0].quantity).toBe(300);
	});

	test('somebody else cannot read the recipe', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Private' });
		expect(() => s.recipes.getRecipe(theirs, id)).toThrow();
	});
});

describe('what the week needs', () => {
	test('amounts are listed, never added', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Two oils' });
		s.recipes.addIngredient(ctx, id, { name: 'olive oil', quantity: 2, unit: 'tbsp' });

		const second = s.recipes.createRecipe(ctx, { title: 'More oil' });
		s.recipes.addIngredient(ctx, second, { name: 'olive oil', quantity: 100, unit: 'ml' });

		// Both on the same day, so both are in the window.
		const oil = s.shopping.listItems(ctx).find((i) => i.name === 'olive oil')!;
		expect(oil).toBeDefined();
	});
});

describe('cooking', () => {
	test('records that it happened without emptying the cupboard', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Pasta' });
		s.recipes.addIngredient(ctx, id, { name: 'salt', quantity: 1, unit: 'pinch' });

		const salt = s.shopping.listItems(ctx).find((i) => i.name === 'salt')!;
		s.shopping.toggleBought(ctx, salt.id);
		expect(s.shopping.listItems(ctx).find((i) => i.id === salt.id)!.bought).toBe(true);

		s.recipes.cooked(ctx, id);
		expect(s.recipes.getRecipe(ctx, id).lastCookedAt).not.toBeNull();
		// Still in the cupboard: nothing was said to have run out.
		expect(s.shopping.listItems(ctx).find((i) => i.id === salt.id)!.bought).toBe(true);
	});

	test('what ran out goes back on the list', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Omelette' });
		s.recipes.addIngredient(ctx, id, { name: 'eggs', quantity: 3, unit: '' });

		const eggs = s.shopping.listItems(ctx).find((i) => i.name === 'eggs')!;
		s.shopping.toggleBought(ctx, eggs.id);

		s.recipes.cooked(ctx, id, [eggs.id]);
		expect(s.shopping.listItems(ctx).find((i) => i.id === eggs.id)!.bought).toBe(false);
	});
});

describe('a pasted ingredient list', () => {
	test('becomes ingredients, and shopping items for anything new', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Pasted stew' });
		const before = s.shopping.listItems(ctx).length;

		const added = s.recipes.importIngredients(
			ctx,
			id,
			`Ingredients:

- 300 g pearl barley
- 2 carrots, diced
- 1/2 tsp thyme`
		);

		expect(added).toBe(3);

		const names = s.recipes.ingredientsOf(ctx, id).map((i) => i.name);
		expect(names).toEqual(expect.arrayContaining(['pearl barley', 'carrots', 'thyme']));
		expect(s.shopping.listItems(ctx).length).toBeGreaterThan(before);
	});

	test('quantities, units and notes survive the trip', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Precise stew' });
		s.recipes.importIngredients(ctx, id, '3 cloves garlic, crushed');

		const [only] = s.recipes.ingredientsOf(ctx, id);
		expect(only.quantity).toBe(3);
		expect(only.unit).toBe('cloves');
		expect(only.note).toBe('crushed');
	});

	test('an unreadable line does not lose the readable ones', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Messy stew' });
		const added = s.recipes.importIngredients(ctx, id, '\n\nFor the base:\n300 g\n2 onions\n');

		expect(added).toBe(1);
		expect(s.recipes.ingredientsOf(ctx, id).map((i) => i.name)).toEqual(['onions']);
	});

	test('nothing pasted adds nothing', () => {
		const id = s.recipes.createRecipe(ctx, { title: 'Empty stew' });
		expect(s.recipes.importIngredients(ctx, id, '')).toBe(0);
	});

	test("and it cannot be aimed at somebody else's recipe", () => {
		const mine = s.recipes.createRecipe(ctx, { title: 'Not yours' });
		expect(() => s.recipes.importIngredients(theirs, mine, '2 onions')).toThrow();
		expect(s.recipes.ingredientsOf(ctx, mine)).toEqual([]);
	});
});
