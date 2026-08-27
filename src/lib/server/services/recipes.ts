/**
 * Recipes, and the loop they close.
 *
 * A recipe here is not a cookbook entry. It is a list of shopping items with
 * amounts, which is what makes "what does this week's food need" a join rather
 * than a text-matching problem: put a recipe on a day, and the ingredients of
 * every meal in the week minus what is already in the cupboard *is* the
 * shopping list.
 *
 * Which is why an ingredient points at `shopping_items` and never holds a name
 * of its own, and why writing a recipe creates the items it mentions. The list
 * stays current because keeping it current is a side effect of cooking.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { parseLines } from '../../ingredient-lines.js';
import { db } from '../db/index.js';
import {
	exceptionalSlots,
	recipeItems,
	recipes,
	shoppingCategories,
	shoppingItems,
	weeklySlots
} from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';

export const MAX_TITLE_LENGTH = 200;
export const MAX_METHOD_LENGTH = 20000;
export const MAX_UNIT_LENGTH = 24;
export const MAX_NOTE_LENGTH = 120;
export const MAX_SOURCE_LENGTH = 500;

export type Ingredient = {
	id: number;
	itemId: number;
	name: string;
	quantity: number | null;
	unit: string;
	note: string;
	/** Whether the cupboard says you have it. */
	inStock: boolean;
};

export type Recipe = {
	id: number;
	title: string;
	method: string;
	notes: string;
	servings: number | null;
	minutes: number | null;
	source: string;
	lastCookedAt: string | null;
	archivedAt: string | null;
};

/**
 * An item is in stock when it is not on the list to be bought.
 *
 * The shopping list already models this and it is enough. Tracking how much
 * rice is in the jar is a rabbit hole with no bottom, and a stock number that
 * is always slightly wrong is worse than a plain yes or no.
 */
const IN_STOCK = sql<boolean>`${shoppingItems.bought} = 1 OR ${shoppingItems.snoozed} = 1`;

// --- what can be an ingredient -------------------------------------------------

/** Items in a category the account has said holds food. */
export function edibleItems(ctx: Ctx) {
	return db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			categoryName: shoppingCategories.name,
			inStock: IN_STOCK
		})
		.from(shoppingItems)
		.innerJoin(shoppingCategories, eq(shoppingItems.shoppingCategoryId, shoppingCategories.id))
		.where(and(eq(shoppingItems.userId, ctx.userId), eq(shoppingCategories.isFood, true)))
		.orderBy(asc(shoppingItems.name))
		.all()
		.map((r) => ({ ...r, inStock: Boolean(r.inStock) }));
}

export function foodCategories(ctx: Ctx) {
	return db
		.select({ id: shoppingCategories.id, name: shoppingCategories.name })
		.from(shoppingCategories)
		.where(and(eq(shoppingCategories.userId, ctx.userId), eq(shoppingCategories.isFood, true)))
		.orderBy(asc(shoppingCategories.sortOrder), asc(shoppingCategories.name))
		.all();
}

/**
 * The item an ingredient names, creating it when it is new.
 *
 * This is the half of the design that makes it worth using: typing "cumin" into
 * a recipe puts cumin on the shopping list, in a food category, marked as
 * something you do not have. Nobody maintains a pantry inventory by hand for
 * longer than a fortnight.
 */
function itemFor(ctx: Ctx, raw: { itemId?: unknown; name?: unknown }): number {
	const id = Number(raw.itemId);
	if (Number.isInteger(id) && id > 0) {
		const owned = db
			.select({ id: shoppingItems.id })
			.from(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
			.get();
		if (!owned) throw new NotFoundError('ingredient');
		return owned.id;
	}

	const name = str(raw.name, 'ingredient', { max: 200 });

	const existing = db
		.select({ id: shoppingItems.id })
		.from(shoppingItems)
		.where(
			and(eq(shoppingItems.userId, ctx.userId), sql`lower(${shoppingItems.name}) = lower(${name})`)
		)
		.get();
	if (existing) return existing.id;

	const category = foodCategories(ctx)[0];
	if (!category)
		throw new ValidationError('No shopping category holds food yet — tick one in settings');

	return db
		.insert(shoppingItems)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			name,
			type: 'replenish',
			shoppingCategoryId: category.id,
			// New to the recipe means new to the cupboard: it goes on the list.
			bought: false
		})
		.returning({ id: shoppingItems.id })
		.get().id;
}

// --- recipes --------------------------------------------------------------------

export function listRecipes(ctx: Ctx, options: { includeArchived?: boolean } = {}): Recipe[] {
	return db
		.select({
			id: recipes.id,
			title: recipes.title,
			method: recipes.method,
			notes: recipes.notes,
			servings: recipes.servings,
			minutes: recipes.minutes,
			source: recipes.source,
			lastCookedAt: recipes.lastCookedAt,
			archivedAt: recipes.archivedAt
		})
		.from(recipes)
		.where(
			and(
				eq(recipes.userId, ctx.userId),
				options.includeArchived ? undefined : isNull(recipes.archivedAt)
			)
		)
		.orderBy(asc(recipes.title))
		.all()
		.map((r) => ({ ...r, notes: r.notes ?? '', source: r.source ?? '' }));
}

export function getRecipe(ctx: Ctx, id: number): Recipe {
	const found = db
		.select({
			id: recipes.id,
			title: recipes.title,
			method: recipes.method,
			notes: recipes.notes,
			servings: recipes.servings,
			minutes: recipes.minutes,
			source: recipes.source,
			lastCookedAt: recipes.lastCookedAt,
			archivedAt: recipes.archivedAt
		})
		.from(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.userId)))
		.get();

	if (!found) throw new NotFoundError('recipe');
	return { ...found, notes: found.notes ?? '', source: found.source ?? '' };
}

export function ingredientsOf(ctx: Ctx, recipeId: number): Ingredient[] {
	return db
		.select({
			id: recipeItems.id,
			itemId: recipeItems.itemId,
			name: shoppingItems.name,
			quantity: recipeItems.quantity,
			unit: recipeItems.unit,
			note: recipeItems.note,
			inStock: IN_STOCK
		})
		.from(recipeItems)
		.innerJoin(shoppingItems, eq(recipeItems.itemId, shoppingItems.id))
		.where(and(eq(recipeItems.recipeId, recipeId), eq(recipeItems.userId, ctx.userId)))
		.orderBy(asc(recipeItems.sortOrder), asc(recipeItems.id))
		.all()
		.map((r) => ({
			...r,
			unit: r.unit ?? '',
			note: r.note ?? '',
			inStock: Boolean(r.inStock)
		}));
}

type RecipeInput = {
	title: unknown;
	method?: unknown;
	notes?: unknown;
	servings?: unknown;
	minutes?: unknown;
	source?: unknown;
};

function parseRecipe(raw: RecipeInput) {
	const optionalCount = (value: unknown, field: string) =>
		value === undefined || value === null || value === ''
			? null
			: num(value, field, { int: true, min: 1, max: 10_000 });

	return {
		title: str(raw.title, 'title', { max: MAX_TITLE_LENGTH }),
		method: optionalStr(raw.method, 'method', { max: MAX_METHOD_LENGTH }),
		notes: optionalStr(raw.notes, 'notes', { max: 2000 }),
		servings: optionalCount(raw.servings, 'servings'),
		minutes: optionalCount(raw.minutes, 'minutes'),
		source: optionalStr(raw.source, 'source', { max: MAX_SOURCE_LENGTH })
	};
}

export function createRecipe(ctx: Ctx, raw: RecipeInput): number {
	return db
		.insert(recipes)
		.values({ ...stamps(ctx), userId: ctx.userId, ...parseRecipe(raw) })
		.returning({ id: recipes.id })
		.get().id;
}

export function updateRecipe(ctx: Ctx, id: number, raw: RecipeInput): void {
	const res = db
		.update(recipes)
		.set({ ...parseRecipe(raw), updatedAt: stamp(ctx) })
		.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('recipe');
}

export function setArchived(ctx: Ctx, id: number, archived: boolean): void {
	const res = db
		.update(recipes)
		.set({ archivedAt: archived ? stamp(ctx) : null, updatedAt: stamp(ctx) })
		.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('recipe');
}

/**
 * Deleting a recipe leaves the shopping items alone.
 *
 * They are things you buy, not parts of the recipe — throwing away a recipe
 * should not take cumin off the list.
 */
export function deleteRecipe(ctx: Ctx, id: number): void {
	const res = db
		.delete(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('recipe');
}

/**
 * You cooked it. What that means for the cupboard is a separate question.
 *
 * The tempting version marks every ingredient as used up, which puts salt on
 * the shopping list after every meal and teaches people to ignore the list. So
 * this only records that it happened; `ranOutOf` is the second half, and the
 * screen asks which ones actually ran out — usually none, sometimes the milk.
 */
export function cooked(ctx: Ctx, id: number, ranOutOf: number[] = []): void {
	const res = db
		.update(recipes)
		.set({ lastCookedAt: stamp(ctx), updatedAt: stamp(ctx) })
		.where(and(eq(recipes.id, id), eq(recipes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('recipe');
	if (ranOutOf.length > 0) markOutOfStock(ctx, ranOutOf);
}

/** Out of the cupboard is onto the list — the two are one state. */
export function markOutOfStock(ctx: Ctx, itemIds: number[]): number {
	const ids = itemIds.filter((id) => Number.isInteger(id) && id > 0);
	if (ids.length === 0) return 0;

	return db
		.update(shoppingItems)
		.set({ bought: false, boughtAt: null, snoozed: false, updatedAt: stamp(ctx) })
		.where(and(eq(shoppingItems.userId, ctx.userId), inArray(shoppingItems.id, ids)))
		.run().changes;
}

// --- ingredients ------------------------------------------------------------------

function assertOwnedRecipe(ctx: Ctx, recipeId: number): void {
	const owned = db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('recipe');
}

export function addIngredient(
	ctx: Ctx,
	recipeId: number,
	raw: { itemId?: unknown; name?: unknown; quantity?: unknown; unit?: unknown; note?: unknown }
): void {
	assertOwnedRecipe(ctx, recipeId);

	const itemId = itemFor(ctx, raw);
	const quantity =
		raw.quantity === undefined || raw.quantity === null || raw.quantity === ''
			? null
			: num(raw.quantity, 'amount', { min: 0.001, max: 100_000 });

	const last =
		db
			.select({ value: sql<number>`max(${recipeItems.sortOrder})` })
			.from(recipeItems)
			.where(eq(recipeItems.recipeId, recipeId))
			.get()?.value ?? 0;

	db.insert(recipeItems)
		.values({
			userId: ctx.userId,
			recipeId,
			itemId,
			quantity,
			unit: optionalStr(raw.unit, 'unit', { max: MAX_UNIT_LENGTH }),
			note: optionalStr(raw.note, 'note', { max: MAX_NOTE_LENGTH }),
			sortOrder: last + 1
		})
		// The same item twice in one recipe is a correction, not a second row.
		.onConflictDoUpdate({
			target: [recipeItems.recipeId, recipeItems.itemId],
			set: {
				quantity,
				unit: optionalStr(raw.unit, 'unit', { max: MAX_UNIT_LENGTH }),
				note: optionalStr(raw.note, 'note', { max: MAX_NOTE_LENGTH })
			}
		})
		.run();
}

/**
 * A pasted ingredient list, added in one go.
 *
 * Every recipe on the internet is a list of lines, and typing them back one
 * combobox at a time is the reason a recipe never gets written down. Anything
 * the parser cannot make sense of is skipped rather than guessed at, and
 * anything that is not already a shopping item becomes one — which is the same
 * thing typing a new name into the field does, and the reason the shopping list
 * stays current without anybody maintaining it.
 *
 * Returns how many lines became ingredients, so the page can say so.
 */
export function importIngredients(ctx: Ctx, recipeId: number, text: unknown): number {
	assertOwnedRecipe(ctx, recipeId);

	const lines = parseLines(str(text, 'list', { max: 10_000, min: 0 }));

	let added = 0;
	db.transaction(() => {
		for (const line of lines) {
			try {
				addIngredient(ctx, recipeId, {
					name: line.name,
					quantity: line.quantity ?? '',
					unit: line.unit,
					note: line.note
				});
				added += 1;
			} catch {
				// One unreadable line should not lose the other nineteen.
			}
		}
	});

	return added;
}

export function removeIngredient(ctx: Ctx, id: number): void {
	const res = db
		.delete(recipeItems)
		.where(and(eq(recipeItems.id, id), eq(recipeItems.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('ingredient');
}

// --- what the week needs ----------------------------------------------------------

export type Needed = {
	itemId: number;
	name: string;
	inStock: boolean;
	/** Every amount asked for, unconverted: "2 tbsp", "100 ml". */
	amounts: string[];
	recipes: string[];
	priceCents: number | null;
};

/**
 * The ingredients of every meal between two dates, minus what is in the
 * cupboard.
 *
 * Amounts are listed rather than added up. Two tablespoons plus a hundred
 * millilitres is not a number, and a total that pretends otherwise is a lie
 * told in a shop.
 */
export function neededBetween(ctx: Ctx, from: string, to: string): Needed[] {
	const oneOffs = db
		.select({ recipeId: exceptionalSlots.recipeId })
		.from(exceptionalSlots)
		.where(
			and(
				eq(exceptionalSlots.userId, ctx.userId),
				sql`${exceptionalSlots.date} >= ${from}`,
				sql`${exceptionalSlots.date} <= ${to}`
			)
		)
		.all();

	// A weekly block happens every week, so it is in any range at all.
	const weekly = db
		.select({ recipeId: weeklySlots.recipeId })
		.from(weeklySlots)
		.where(and(eq(weeklySlots.userId, ctx.userId), eq(weeklySlots.active, true)))
		.all();

	const ids = [
		...new Set([...oneOffs, ...weekly].map((r) => r.recipeId).filter(Boolean))
	] as number[];
	if (ids.length === 0) return [];

	const rows = db
		.select({
			itemId: recipeItems.itemId,
			name: shoppingItems.name,
			quantity: recipeItems.quantity,
			unit: recipeItems.unit,
			priceCents: shoppingItems.priceCents,
			recipeTitle: recipes.title,
			inStock: IN_STOCK
		})
		.from(recipeItems)
		.innerJoin(shoppingItems, eq(recipeItems.itemId, shoppingItems.id))
		.innerJoin(recipes, eq(recipeItems.recipeId, recipes.id))
		.where(and(eq(recipeItems.userId, ctx.userId), inArray(recipeItems.recipeId, ids)))
		.orderBy(asc(shoppingItems.name))
		.all();

	const byItem = new Map<number, Needed>();
	for (const row of rows) {
		const found = byItem.get(row.itemId) ?? {
			itemId: row.itemId,
			name: row.name,
			inStock: Boolean(row.inStock),
			amounts: [],
			recipes: [],
			priceCents: row.priceCents
		};

		const amount = [row.quantity, row.unit].filter(Boolean).join(' ').trim();
		if (amount && !found.amounts.includes(amount)) found.amounts.push(amount);
		if (!found.recipes.includes(row.recipeTitle)) found.recipes.push(row.recipeTitle);

		byItem.set(row.itemId, found);
	}

	return [...byItem.values()];
}

/**
 * The meals planned between two dates.
 *
 * A meal is a one-off block with a recipe on it. Weekly blocks with recipes
 * exist too, but they repeat forever and putting them on a dated calendar would
 * mean expanding them; `neededBetween` counts them, and this lists what was
 * deliberately put on a day.
 */
export function mealsBetween(ctx: Ctx, from: string, to: string) {
	return db
		.select({
			id: exceptionalSlots.id,
			date: exceptionalSlots.date,
			startTime: exceptionalSlots.startTime,
			recipeId: exceptionalSlots.recipeId,
			title: recipes.title,
			minutes: recipes.minutes
		})
		.from(exceptionalSlots)
		.innerJoin(recipes, eq(exceptionalSlots.recipeId, recipes.id))
		.where(
			and(
				eq(exceptionalSlots.userId, ctx.userId),
				sql`${exceptionalSlots.date} >= ${from}`,
				sql`${exceptionalSlots.date} <= ${to}`
			)
		)
		.orderBy(asc(exceptionalSlots.date), asc(exceptionalSlots.startTime))
		.all();
}

/** Recipes ordered by how much of them you already have. */
export function withMissingCounts(ctx: Ctx) {
	const counts = db
		.select({
			recipeId: recipeItems.recipeId,
			total: sql<number>`count(*)`,
			missing: sql<number>`sum(case when ${IN_STOCK} then 0 else 1 end)`
		})
		.from(recipeItems)
		.innerJoin(shoppingItems, eq(recipeItems.itemId, shoppingItems.id))
		.where(eq(recipeItems.userId, ctx.userId))
		.groupBy(recipeItems.recipeId)
		.all();

	const byRecipe = new Map(counts.map((c) => [c.recipeId, c]));

	return listRecipes(ctx).map((recipe) => {
		const count = byRecipe.get(recipe.id);
		return {
			...recipe,
			ingredients: count?.total ?? 0,
			missing: Number(count?.missing ?? 0)
		};
	});
}
