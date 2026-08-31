/**
 * Recipes and the shopping list they feed, and the keys plugins hold.
 *
 * The recipe half is really about one claim: what you cook drives what you
 * have to buy. So the seam worth pinning is that running out of something
 * while cooking puts it back on the list, and that an ingredient names a real
 * shopping item rather than a loose string — otherwise the two halves of the
 * feature drift apart.
 *
 * A token is the only credential an external program gets. Its rules are the
 * ones somebody would probe: the plaintext is never stored, a revoked or
 * expired one is refused, and a scope it does not hold is refused by name.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let recipes: typeof import('../src/lib/server/services/recipes');
let shopping: typeof import('../src/lib/server/services/shopping');
let tokens: typeof import('../src/lib/server/services/tokens');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
const now = new Date('2026-08-17T09:00:00Z');

beforeAll(async () => {
	recipes = await import('../src/lib/server/services/recipes');
	shopping = await import('../src/lib/server/services/shopping');
	tokens = await import('../src/lib/server/services/tokens');
	ctx = { userId: OWNER, now, tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	// Only a food category can hold ingredients — that is the link between the
	// two features, and without one an ingredient has nowhere to become an item.
	shopping.createCategory(ctx, { name: 'Pantry', isFood: true });
});

describe('a recipe', () => {
	test('keeps what it was given', () => {
		const id = recipes.createRecipe(ctx, {
			title: 'Bread',
			method: 'Mix. Wait. Bake.',
			servings: 2,
			minutes: 180,
			source: 'a book'
		});

		const recipe = recipes.getRecipe(ctx, id);
		expect(recipe.title).toBe('Bread');
		expect(recipe.servings).toBe(2);
		expect(recipe.minutes).toBe(180);
	});

	test('refuses a nameless one', () => {
		expect(() => recipes.createRecipe(ctx, { title: '   ' })).toThrow();
	});

	test('can be archived and comes back', () => {
		const id = recipes.createRecipe(ctx, { title: 'Old favourite' });

		recipes.setArchived(ctx, id, true);
		expect(recipes.listRecipes(ctx).some((r) => r.id === id)).toBe(false);
		expect(recipes.listRecipes(ctx, { includeArchived: true }).some((r) => r.id === id)).toBe(true);

		recipes.setArchived(ctx, id, false);
		expect(recipes.listRecipes(ctx).some((r) => r.id === id)).toBe(true);
	});

	test("is not another account's to read or change", () => {
		const mine = recipes.listRecipes(ctx)[0];
		expect(() => recipes.getRecipe(theirs, mine.id)).toThrow();
		expect(() => recipes.updateRecipe(theirs, mine.id, { title: 'taken' })).toThrow();
		expect(() => recipes.deleteRecipe(theirs, mine.id)).toThrow();
	});
});

describe('what a recipe is made of', () => {
	test('an ingredient names a real shopping item', () => {
		const id = recipes.createRecipe(ctx, { title: 'Porridge' });
		recipes.addIngredient(ctx, id, { name: 'oats', quantity: 80, unit: 'g' });

		const [ingredient] = recipes.ingredientsOf(ctx, id);
		expect(ingredient.name).toBe('oats');
		expect(ingredient.quantity).toBe(80);
		// Writing a recipe fills the shopping list as a side effect — that is
		// the whole point of the link.
		expect(shopping.listItems(ctx).some((i) => i.name === 'oats')).toBe(true);
	});

	test('the same item twice in one recipe is a correction, not a second row', () => {
		const id = recipes.createRecipe(ctx, { title: 'Twice' });
		recipes.addIngredient(ctx, id, { name: 'salt', quantity: 1, unit: 'tsp' });
		recipes.addIngredient(ctx, id, { name: 'salt', quantity: 2, unit: 'tsp' });

		const ingredients = recipes.ingredientsOf(ctx, id);
		expect(ingredients).toHaveLength(1);
		expect(ingredients[0].quantity).toBe(2);
	});

	test('refuses an amount that is not one', () => {
		const id = recipes.createRecipe(ctx, { title: 'Bad amounts' });
		expect(() => recipes.addIngredient(ctx, id, { name: 'flour', quantity: -1 })).toThrow();
		expect(() => recipes.addIngredient(ctx, id, { name: 'flour', quantity: 'lots' })).toThrow();
	});

	test("will not add to another account's recipe", () => {
		const mine = recipes.listRecipes(ctx)[0];
		expect(() => recipes.addIngredient(theirs, mine.id, { name: 'sneaky' })).toThrow();
	});

	test('a pasted list becomes ingredients', () => {
		const id = recipes.createRecipe(ctx, { title: 'Pasted' });
		const added = recipes.importIngredients(
			ctx,
			id,
			['200 g flour', '1 tsp salt', '2 eggs, room temperature'].join('\n')
		);

		expect(added).toBe(3);
		const names = recipes.ingredientsOf(ctx, id).map((i) => i.name);
		expect(names).toEqual(expect.arrayContaining(['flour', 'salt', 'eggs']));
	});

	test('and says which recipes use an item, for the other direction', () => {
		const byItem = recipes.recipesByItem(ctx);
		const oats = shopping.listItems(ctx).find((i) => i.name === 'oats')!;
		expect(byItem[oats.id].map((r) => r.title)).toContain('Porridge');
	});
});

describe('cooking something', () => {
	test('stamps when, and puts what you ran out of back on the list', () => {
		const id = recipes.createRecipe(ctx, { title: 'Soup' });
		recipes.addIngredient(ctx, id, { name: 'stock', quantity: 1 });

		const stock = shopping.listItems(ctx).find((i) => i.name === 'stock')!;
		shopping.toggleBought(ctx, stock.id); // in the cupboard

		recipes.cooked(ctx, id, [stock.id]);

		expect(recipes.getRecipe(ctx, id).lastCookedAt).toBeTruthy();
		// Out of the cupboard is onto the list — the two are one state.
		expect(shopping.listItems(ctx).find((i) => i.id === stock.id)!.bought).toBeFalsy();
	});

	test('cooking something that is not yours is refused', () => {
		const mine = recipes.listRecipes(ctx)[0];
		expect(() => recipes.cooked(theirs, mine.id)).toThrow();
	});
});

describe('a token a plugin holds', () => {
	test('is shown once and never stored in the clear', () => {
		const made = tokens.createToken(ctx, { name: 'phone widget', scopes: 'today:read' });

		expect(made.plaintext).toMatch(/^onto_/);
		// The list can show a prefix so a row is recognisable, and nothing more.
		const listed = tokens.listTokens(ctx).find((t) => t.id === made.id)!;
		expect(JSON.stringify(listed)).not.toContain(made.plaintext);
	});

	/**
	 * The calendar link is the exception, deliberately.
	 *
	 * It lives in a URL pasted into a calendar app, so "set it up on the phone,
	 * then want it on the laptop a fortnight later" is the ordinary case — and
	 * with nothing stored, the only answer was to replace the link and redo the
	 * phone. It is kept in the clear because what it can do is bounded: read the
	 * plan, and nothing else. These tests are that bound.
	 */
	describe('a calendar link', () => {
		test('keeps its address so it can be shown again', () => {
			const made = tokens.createToken(ctx, { name: 'phone', scopes: 'calendar:read' });
			const listed = tokens.listTokens(ctx).find((t) => t.id === made.id)!;

			expect(listed.plaintext).toBe(made.plaintext);
		});

		test('and is the only kind of token that does', () => {
			const made = tokens.createToken(ctx, { name: 'a widget', scopes: 'today:read' });
			const listed = tokens.listTokens(ctx).find((t) => t.id === made.id)!;

			expect(listed.plaintext).toBeNull();
		});

		test('cannot be combined with a scope that does anything else', () => {
			// Otherwise a key that writes to the shopping list ends up in a URL
			// pasted into somebody's calendar app — and it would not work as a
			// feed either, since the route accepts that one scope alone.
			expect(() =>
				tokens.createToken(ctx, { name: 'mixed', scopes: ['calendar:read', 'shopping:write'] })
			).toThrow(/cannot be combined/i);
		});

		test('runs out at five', () => {
			const fresh = { ...ctx, userId: STRANGER };
			for (let i = 0; i < tokens.CALENDAR_LINK_LIMIT; i++) {
				tokens.createToken(fresh, { name: `link ${i}`, scopes: 'calendar:read' });
			}

			expect(() =>
				tokens.createToken(fresh, { name: 'one too many', scopes: 'calendar:read' })
			).toThrow(/revoke one/i);

			// And revoking one makes room again, rather than the count being of
			// everything ever made.
			const [first] = tokens.listTokens(fresh);
			tokens.revokeToken(fresh, first.id);
			expect(() =>
				tokens.createToken(fresh, { name: 'room again', scopes: 'calendar:read' })
			).not.toThrow();
		});
	});

	test('needs at least one scope the app knows', () => {
		expect(() => tokens.createToken(ctx, { name: 'empty', scopes: '' })).toThrow();
		expect(() => tokens.createToken(ctx, { name: 'nonsense', scopes: 'wat:read' })).toThrow();
	});

	test('authenticates, and says which account and scopes it carries', () => {
		const made = tokens.createToken(ctx, { name: 'reader', scopes: 'today:read' });
		const authed = tokens.authenticateToken(made.plaintext, now);

		expect(authed.userId).toBe(OWNER);
		expect(authed.scopes).toContain('today:read');
	});

	test('refuses a scope it does not hold, by name', () => {
		const made = tokens.createToken(ctx, { name: 'narrow', scopes: 'today:read' });
		const authed = tokens.authenticateToken(made.plaintext, now);

		expect(() => tokens.requireScope(authed, 'today:read')).not.toThrow();
		expect(() => tokens.requireScope(authed, 'shopping:write')).toThrow(/shopping:write/);
	});

	test('refuses anything that is not one of its tokens', () => {
		expect(() => tokens.authenticateToken('', now)).toThrow();
		expect(() => tokens.authenticateToken('not-a-token', now)).toThrow();
		expect(() => tokens.authenticateToken('onto_deadbeef', now)).toThrow();
	});

	test('stops working the moment it is revoked', () => {
		const made = tokens.createToken(ctx, { name: 'doomed', scopes: 'today:read' });
		tokens.revokeToken(ctx, made.id);
		expect(() => tokens.authenticateToken(made.plaintext, now)).toThrow(/revoked/i);
	});

	test('stops working when it expires', () => {
		const made = tokens.createToken(ctx, {
			name: 'short-lived',
			scopes: 'today:read',
			expiresInDays: 1
		});

		const later = new Date(now.getTime() + 3 * 86400_000);
		expect(() => tokens.authenticateToken(made.plaintext, later)).toThrow(/expired/i);
	});

	test("is not another account's to revoke", () => {
		const mine = tokens.listTokens(ctx)[0];
		expect(() => tokens.revokeToken(theirs, mine.id)).toThrow();
	});
});
