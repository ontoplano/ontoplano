import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { shoppingCategories, shoppingItems } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, oneOf, optionalStr, str } from './validate.js';

/**
 * Two lists that share a table: `replenish` is stock you keep, `someday` is a
 * wishlist. The difference is what "bought" means — a replenish item comes back
 * when it runs out, a someday item is done.
 */

export const ITEM_TYPES = ['someday', 'replenish'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;

export type ItemInput = {
	name: unknown;
	type: unknown;
	notes?: unknown;
	shoppingCategoryId?: unknown;
};

export function listItems(ctx: Ctx) {
	return db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			type: shoppingItems.type,
			shoppingCategoryId: shoppingItems.shoppingCategoryId,
			shoppingCategoryName: shoppingCategories.name,
			notes: shoppingItems.notes,
			bought: shoppingItems.bought,
			boughtAt: shoppingItems.boughtAt,
			snoozed: shoppingItems.snoozed,
			createdAt: shoppingItems.createdAt
		})
		.from(shoppingItems)
		.leftJoin(shoppingCategories, eq(shoppingItems.shoppingCategoryId, shoppingCategories.id))
		.where(eq(shoppingItems.userId, ctx.userId))
		.orderBy(shoppingItems.bought, desc(shoppingItems.createdAt))
		.all();
}

export function listCategories(ctx: Ctx) {
	return db
		.select({
			id: shoppingCategories.id,
			name: shoppingCategories.name,
			isFood: shoppingCategories.isFood,
			sortOrder: shoppingCategories.sortOrder
		})
		.from(shoppingCategories)
		.where(eq(shoppingCategories.userId, ctx.userId))
		.orderBy(shoppingCategories.sortOrder)
		.all();
}

export function createCategory(ctx: Ctx, raw: { name: unknown; isFood?: unknown }): number {
	const name = str(raw.name, 'name', { max: 60 });

	const existing = db
		.select({ id: shoppingCategories.id })
		.from(shoppingCategories)
		.where(
			and(
				eq(shoppingCategories.userId, ctx.userId),
				sql`lower(${shoppingCategories.name}) = lower(${name})`
			)
		)
		.get();
	if (existing) throw new ValidationError('There is already a category with that name');

	const last =
		db
			.select({ value: sql<number>`max(${shoppingCategories.sortOrder})` })
			.from(shoppingCategories)
			.where(eq(shoppingCategories.userId, ctx.userId))
			.get()?.value ?? 0;

	return db
		.insert(shoppingCategories)
		.values({
			userId: ctx.userId,
			name,
			isFood: raw.isFood === true || raw.isFood === 'true',
			sortOrder: last + 1
		})
		.returning({ id: shoppingCategories.id })
		.get().id;
}

/**
 * Whether things in this category can be an ingredient.
 *
 * One tick per category rather than per item: otherwise every tin of tomatoes
 * has to be marked by hand, and the television has to be marked as not.
 */
export function setCategoryFood(ctx: Ctx, id: number, isFood: boolean): void {
	const res = db
		.update(shoppingCategories)
		.set({ isFood })
		.where(and(eq(shoppingCategories.id, id), eq(shoppingCategories.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('category');
}

/**
 * Adding something already on the list puts it back on it.
 *
 * Typing "milk" twice used to give two rows named milk with no hint that one
 * was already there, which is never what somebody meant: they either forgot, or
 * they bought it last week and need it again. Either way the answer is one row,
 * marked as needed.
 *
 * Returns whether it was a name already held, so the page can say so.
 */
export function createItem(ctx: Ctx, raw: ItemInput): { alreadyHad: boolean } {
	const values = parseItem(ctx, raw);

	const existing = db
		.select({ id: shoppingItems.id })
		.from(shoppingItems)
		.where(
			and(
				eq(shoppingItems.userId, ctx.userId),
				sql`lower(${shoppingItems.name}) = lower(${values.name})`
			)
		)
		.get();

	if (existing) {
		db.update(shoppingItems)
			.set({ bought: false, boughtAt: null, snoozed: false, updatedAt: stamp(ctx) })
			.where(and(eq(shoppingItems.id, existing.id), eq(shoppingItems.userId, ctx.userId)))
			.run();
		return { alreadyHad: true };
	}

	db.insert(shoppingItems)
		.values({ ...stamps(ctx), userId: ctx.userId, ...values })
		.run();

	return { alreadyHad: false };
}

export function updateItem(ctx: Ctx, id: number, raw: ItemInput): void {
	const values = parseItem(ctx, raw);

	const res = db
		.update(shoppingItems)
		.set({ ...values, updatedAt: stamp(ctx) })
		.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('item');
}

export function deleteItem(ctx: Ctx, id: number): void {
	const res = db
		.delete(shoppingItems)
		.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('item');
}

export function toggleBought(ctx: Ctx, id: number): void {
	const item = ownedItem(ctx, id);
	const now = stamp(ctx);

	db.update(shoppingItems)
		.set({ bought: !item.bought, boughtAt: item.bought ? null : now, updatedAt: now })
		.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
		.run();
}

/** Put a replenish item back on the list; a wishlist item has nothing to restock. */
export function restockItem(ctx: Ctx, id: number): void {
	const item = ownedItem(ctx, id);
	if (item.type !== 'replenish') throw new ValidationError('Only replenish items can be restocked');

	db.update(shoppingItems)
		.set({ bought: false, boughtAt: null, updatedAt: stamp(ctx) })
		.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
		.run();
}

export function toggleSnoozed(ctx: Ctx, id: number): void {
	const item = ownedItem(ctx, id);

	db.update(shoppingItems)
		.set({ snoozed: !item.snoozed, updatedAt: stamp(ctx) })
		.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
		.run();
}

function ownedItem(ctx: Ctx, id: number) {
	const row = db
		.select({
			id: shoppingItems.id,
			type: shoppingItems.type,
			bought: shoppingItems.bought,
			snoozed: shoppingItems.snoozed
		})
		.from(shoppingItems)
		.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
		.get();

	if (!row) throw new NotFoundError('item');
	return row;
}

function parseItem(ctx: Ctx, raw: ItemInput) {
	return {
		name: str(raw.name, 'name', { max: MAX_NAME_LENGTH }),
		type: oneOf(raw.type, 'type', ITEM_TYPES),
		notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
		shoppingCategoryId: parseCategoryId(ctx, raw.shoppingCategoryId)
	};
}

/**
 * A category id from a form is just a number until it is checked: without this
 * an item could be filed under someone else's category.
 */
function parseCategoryId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'category', { int: true, min: 1 });
	const owned = db
		.select({ id: shoppingCategories.id })
		.from(shoppingCategories)
		.where(and(eq(shoppingCategories.id, id), eq(shoppingCategories.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('category');
	return id;
}

/** What is still to buy, for the dashboard card. */
export function listToBuy(ctx: Ctx) {
	return db
		.select({ id: shoppingItems.id, name: shoppingItems.name, type: shoppingItems.type })
		.from(shoppingItems)
		.where(and(eq(shoppingItems.userId, ctx.userId), eq(shoppingItems.bought, false)))
		.orderBy(desc(shoppingItems.createdAt))
		.all();
}
