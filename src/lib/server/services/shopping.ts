import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { locations, pricePoints, shoppingCategories, shoppingItems } from '../db/schema.js';
import { getLocation } from './locations.js';
import { localDateOf, type Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { emit } from './webhooks.js';
import { num, oneOf, optionalStr, str } from './validate.js';
import { parseMoney } from '../../money.js';
import { getCurrency } from '../settings.js';
import { familyUserIds } from './subscriptions.js';

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
	price?: unknown;
	shoppingCategoryId?: unknown;
	/** Where it lives, when it is being written down for the first time. */
	locationId?: unknown;
};

/*
 * SHARING, AND WHERE IT STOPS
 *
 * A section marked shared-with-family widens who may REACH its items — the
 * payer and the seats of its owner's plan can see them, add to them, tick
 * them bought. It never widens who OWNS anything: rows keep their writers'
 * user_id, and managing the section itself (rename, delete, the food flag,
 * the share flag) stays the owner's alone. Alone on no plan, the family
 * circle is just yourself and every predicate below collapses to the
 * ordinary ownership check.
 */

/**
 * Ids of every family-shared section in this account's circle — the whole
 * circle, its own included: a member's milk filed under the OWNER's shared
 * shelf has to reach the owner too, and rows only meet across accounts
 * through one of these.
 */
function sharedCategoryIds(ctx: Ctx): number[] {
	const circle = familyUserIds(ctx.userId);
	if (circle.length <= 1) return [];
	return db
		.select({ id: shoppingCategories.id })
		.from(shoppingCategories)
		.where(
			and(inArray(shoppingCategories.userId, circle), eq(shoppingCategories.sharedWithFamily, true))
		)
		.all()
		.map((row) => row.id);
}

/** The condition for an item this account may see and act on. */
function itemReach(ctx: Ctx) {
	const shared = sharedCategoryIds(ctx);
	if (shared.length === 0) return eq(shoppingItems.userId, ctx.userId);
	return or(
		eq(shoppingItems.userId, ctx.userId),
		inArray(shoppingItems.shoppingCategoryId, shared)
	)!;
}

function itemWhere(ctx: Ctx, id: number) {
	return and(eq(shoppingItems.id, id), itemReach(ctx));
}

/** A location that is the caller's own, or a loud refusal. */
function ownedLocation(ctx: Ctx, locationId: number): void {
	getLocation(ctx, locationId);
}

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
			priceCents: shoppingItems.priceCents,
			locationId: shoppingItems.locationId,
			attributes: shoppingItems.attributes,
			boughtAt: shoppingItems.boughtAt,
			snoozed: shoppingItems.snoozed,
			createdAt: shoppingItems.createdAt,
			ownerId: shoppingItems.userId
		})
		.from(shoppingItems)
		.leftJoin(shoppingCategories, eq(shoppingItems.shoppingCategoryId, shoppingCategories.id))
		.where(itemReach(ctx))
		.orderBy(shoppingItems.bought, desc(shoppingItems.createdAt))
		.all()
		.map(({ ownerId, ...item }) => ({ ...item, mine: ownerId === ctx.userId }));
}

export function listCategories(ctx: Ctx) {
	const others = familyUserIds(ctx.userId).filter((id) => id !== ctx.userId);
	return db
		.select({
			id: shoppingCategories.id,
			name: shoppingCategories.name,
			isFood: shoppingCategories.isFood,
			sortOrder: shoppingCategories.sortOrder,
			sharedWithFamily: shoppingCategories.sharedWithFamily,
			ownerId: shoppingCategories.userId
		})
		.from(shoppingCategories)
		.where(
			others.length === 0
				? eq(shoppingCategories.userId, ctx.userId)
				: or(
						eq(shoppingCategories.userId, ctx.userId),
						and(
							inArray(shoppingCategories.userId, others),
							eq(shoppingCategories.sharedWithFamily, true)
						)
					)!
		)
		.orderBy(shoppingCategories.sortOrder)
		.all()
		.map(({ ownerId, ...category }) => ({ ...category, mine: ownerId === ctx.userId }));
}

/** Share a section with the family, or stop. The owner's switch alone. */
export function setCategoryShared(ctx: Ctx, id: number, shared: boolean): void {
	const res = db
		.update(shoppingCategories)
		.set({ sharedWithFamily: shared })
		.where(and(eq(shoppingCategories.id, id), eq(shoppingCategories.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('category');
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
export function renameCategory(ctx: Ctx, id: number, raw: unknown): void {
	const name = str(raw, 'name', { max: 60 });

	const clash = db
		.select({ id: shoppingCategories.id })
		.from(shoppingCategories)
		.where(
			and(
				eq(shoppingCategories.userId, ctx.userId),
				sql`lower(${shoppingCategories.name}) = lower(${name})`
			)
		)
		.get();
	if (clash && clash.id !== id)
		throw new ValidationError('There is already a category with that name');

	const res = db
		.update(shoppingCategories)
		.set({ name })
		.where(and(eq(shoppingCategories.id, id), eq(shoppingCategories.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('category');
}

/**
 * Deleting a category unfiles its items rather than taking them along: the
 * category is organisation, the items are somebody's cupboard, and removing a
 * shelf label must not empty the shelf.
 */
export function deleteCategory(ctx: Ctx, id: number): void {
	db.transaction(() => {
		db.update(shoppingItems)
			.set({ shoppingCategoryId: null })
			.where(and(eq(shoppingItems.shoppingCategoryId, id), eq(shoppingItems.userId, ctx.userId)))
			.run();

		const res = db
			.delete(shoppingCategories)
			.where(and(eq(shoppingCategories.id, id), eq(shoppingCategories.userId, ctx.userId)))
			.run();

		if (res.changes === 0) throw new NotFoundError('category');
	});
}

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
		.select({ id: shoppingItems.id, bought: shoppingItems.bought, snoozed: shoppingItems.snoozed })
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
		// The event fires on the edge: only if this actually put the item back on
		// the list. Re-adding something already waiting changes nothing, and a
		// webhook for it would let two synced lists ping-pong forever.
		if (existing.bought || existing.snoozed)
			emit(ctx, 'shopping.added', { id: existing.id, name: values.name });
		return { alreadyHad: true };
	}

	/*
	 * Where it lives, said once, while it is being written down.
	 *
	 * Only on the way in. `updateItem` re-parses the whole row, and an edit
	 * form that does not ask about the location would post none and quietly
	 * unfile the thing — so filing after the fact is `setItemLocation`, which
	 * is also what a drag posts.
	 */
	const locationId = parseLocationId(ctx, raw.locationId);

	const result = db
		.insert(shoppingItems)
		.values({ ...stamps(ctx), userId: ctx.userId, ...values, locationId })
		.run();

	emit(ctx, 'shopping.added', { id: Number(result.lastInsertRowid), name: values.name });
	return { alreadyHad: false };
}

/**
 * Something you already own, filed where it lives.
 *
 * `createItem` is for a thing to buy: it revives a bought row rather than
 * making a second one, and it fires `shopping.added` so a synced list learns
 * about it. Neither is right here — a tape that has been in the drawer for ten
 * years was never wanted, and putting it on somebody's list would be the
 * opposite of what "I have it" means. So it arrives bought, with an address,
 * and the to-buy half never shows it.
 *
 * Returns the new item's id, or the existing one when a thing by that name is
 * already known: filing the tape you already listed should move it, not
 * duplicate it.
 */
export function createOwnedThing(
	ctx: Ctx,
	raw: { name: unknown; notes?: unknown; locationId?: unknown }
): number {
	const name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });
	const notes = optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH });

	const existing = db
		.select({ id: shoppingItems.id })
		.from(shoppingItems)
		.where(
			and(eq(shoppingItems.userId, ctx.userId), sql`lower(${shoppingItems.name}) = lower(${name})`)
		)
		.get();

	if (existing) {
		db.update(shoppingItems)
			.set({ bought: true, boughtAt: stamp(ctx), snoozed: false, updatedAt: stamp(ctx) })
			.where(and(eq(shoppingItems.id, existing.id), eq(shoppingItems.userId, ctx.userId)))
			.run();
		return existing.id;
	}

	const result = db
		.insert(shoppingItems)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			name,
			/*
			 * `someday`, not `replenish`, and the difference is what the list
			 * does with it once it is bought. A restockable is shown even when
			 * you have it — that is the point of "we are out of milk". A tape is
			 * a thing you own once, and it belongs on the list only if somebody
			 * puts it there, so it takes the type the to-buy view hides.
			 */
			type: 'someday',
			notes,
			bought: true,
			boughtAt: stamp(ctx)
		})
		.run();
	return Number(result.lastInsertRowid);
}

export function updateItem(ctx: Ctx, id: number, raw: ItemInput): void {
	const values = parseItem(ctx, raw);

	const res = db
		.update(shoppingItems)
		.set({ ...values, updatedAt: stamp(ctx) })
		.where(itemWhere(ctx, id))
		.run();

	if (res.changes === 0) throw new NotFoundError('item');
}

/**
 * File an item into a section, or out of every one, touching nothing else.
 *
 * `updateItem` re-parses the whole row, so filing through it means re-sending
 * name and type just to move a thing — which is exactly the call an assistant
 * gets wrong. One field, one change.
 */
export function setItemCategory(ctx: Ctx, id: number, categoryId: number | null): void {
	// The same reachability rule the full update applies — yours, or a
	// family member's shared shelf.
	const filed = parseCategoryId(ctx, categoryId);

	const res = db
		.update(shoppingItems)
		.set({ shoppingCategoryId: filed, updatedAt: stamp(ctx) })
		.where(itemWhere(ctx, id))
		.run();

	if (res.changes === 0) throw new NotFoundError('item');
}

/**
 * Say where a thing lives, or that it lives nowhere in particular — the
 * inventory half of an item. The location must be the caller's own.
 */
export function setItemLocation(ctx: Ctx, id: number, locationId: number | null): void {
	if (locationId !== null) ownedLocation(ctx, locationId);
	const res = db
		.update(shoppingItems)
		.set({ locationId, updatedAt: stamp(ctx) })
		.where(itemWhere(ctx, id))
		.run();
	if (res.changes === 0) throw new NotFoundError('item');
}

/**
 * The item's own fields, replaced wholesale — { length: '5m', kind: 'tailor' }.
 * A string->string map, because an inventory holds things that do not share a
 * shape, and a fixed set of columns is exactly the assumption that fails.
 */
export function setItemAttributes(ctx: Ctx, id: number, attributes: Record<string, string>): void {
	const clean: Record<string, string> = {};
	for (const [k, v] of Object.entries(attributes ?? {})) {
		const key = String(k).trim().slice(0, 60);
		if (key) clean[key] = String(v ?? '').slice(0, 500);
	}
	const res = db
		.update(shoppingItems)
		.set({ attributes: JSON.stringify(clean), updatedAt: stamp(ctx) })
		.where(itemWhere(ctx, id))
		.run();
	if (res.changes === 0) throw new NotFoundError('item');
}

export function deleteItem(ctx: Ctx, id: number): void {
	const res = db.delete(shoppingItems).where(itemWhere(ctx, id)).run();

	if (res.changes === 0) throw new NotFoundError('item');
}

export function toggleBought(ctx: Ctx, id: number, raw: { paid?: unknown } = {}): void {
	const item = ownedItem(ctx, id);
	const now = stamp(ctx);
	const buying = !item.bought;

	db.update(shoppingItems)
		.set({ bought: buying, boughtAt: buying ? now : null, updatedAt: now })
		.where(itemWhere(ctx, id))
		.run();

	// A price given at the same time is the same act, but the tick never waits
	// for one: it happens in a supermarket aisle, one press, often offline.
	if (buying && raw.paid !== undefined && raw.paid !== null && raw.paid !== '')
		recordPaid(ctx, id, raw.paid);

	if (buying) emit(ctx, 'shopping.bought', { id, name: item.name });
}

/**
 * Set bought to a stated value — the API's verb, where the page's is a toggle.
 *
 * Idempotent on purpose: a plugin mirroring two lists says "this is bought"
 * and must be able to say it twice. Only a transition fires the webhook, so a
 * pair of synced lists settles instead of ping-ponging.
 */
export function setBought(ctx: Ctx, id: number, bought: boolean): { changed: boolean } {
	const item = ownedItem(ctx, id);
	if (item.bought === bought) return { changed: false };
	toggleBought(ctx, id);
	return { changed: true };
}

/**
 * A category id for a name, creating the category if it is new.
 *
 * For the API, where a producer says "Dairy" and should not have to make a
 * second request to find out what number that is.
 */
export function ensureCategoryId(ctx: Ctx, name: unknown): number {
	const wanted = str(name, 'category', { max: 60 });
	const existing = db
		.select({ id: shoppingCategories.id })
		.from(shoppingCategories)
		.where(
			and(
				eq(shoppingCategories.userId, ctx.userId),
				sql`lower(${shoppingCategories.name}) = lower(${wanted})`
			)
		)
		.get();
	return existing?.id ?? createCategory(ctx, { name: wanted });
}

/**
 * What you actually paid.
 *
 * The item's own `priceCents` is a *last known* price and gets overwritten,
 * which answers "what will this shop cost" and nothing over time. A row per
 * purchase answers the other question — milk has gone from 1.20 to 1.60 this
 * year, which nobody else's app will tell you.
 *
 * Only written when somebody says a number. A chart built out of guesses is
 * worse than no chart.
 */
export function recordPaid(ctx: Ctx, id: number, raw: unknown): void {
	ownedItem(ctx, id);

	const paid = parseMoney(raw, getCurrency(ctx.userId));
	if (paid === null) throw new ValidationError('Invalid price');

	db.transaction((tx) => {
		tx.insert(pricePoints)
			.values({
				userId: ctx.userId,
				itemId: id,
				priceCents: paid,
				forDate: localDateOf(ctx.now, ctx.tz)
			})
			.run();

		// A confirmed price is the best "about" there is.
		tx.update(shoppingItems)
			.set({ priceCents: paid, updatedAt: stamp(ctx) })
			.where(itemWhere(ctx, id))
			.run();
	});
}

export type PricePoint = { priceCents: number; forDate: string };

/** Everything ever paid for one item, oldest first. */
export function priceHistory(ctx: Ctx, id: number): PricePoint[] {
	ownedItem(ctx, id);

	return db
		.select({ priceCents: pricePoints.priceCents, forDate: pricePoints.forDate })
		.from(pricePoints)
		.where(and(eq(pricePoints.itemId, id), eq(pricePoints.userId, ctx.userId)))
		.orderBy(asc(pricePoints.forDate), asc(pricePoints.id))
		.all();
}

/*
 * There used to be a `priceDrifts` here, showing "R$7.20 → R$8.90 (+24%)" on
 * a row. It compared the newest purchase against the FIRST one ever recorded,
 * which is not a trend — one mistyped price at the beginning poisoned the
 * comparison for good, and nothing in the app could correct it.
 *
 * Saying nothing beats saying something wrong, so it is gone. The purchases
 * are still recorded (`pricePoints` below), which is what a real answer would
 * be built on: an editable price history, and a comparison against a recent
 * window rather than against the beginning of time.
 */

/**
 * How a price has moved, in the one sentence worth reading.
 *
 * Null until there are two prices to compare, because "it cost 1.60" is
 * already on the item and saying it twice is not insight.
 */
export function priceDrift(
	ctx: Ctx,
	id: number
): { from: PricePoint; to: PricePoint; percent: number } | null {
	const points = priceHistory(ctx, id);
	if (points.length < 2) return null;

	const from = points[0];
	const to = points[points.length - 1];
	if (from.priceCents === 0) return null;

	return {
		from,
		to,
		percent: Math.round(((to.priceCents - from.priceCents) / from.priceCents) * 100)
	};
}

/** Put a replenish item back on the list; a wishlist item has nothing to restock. */
export function restockItem(ctx: Ctx, id: number): void {
	const item = ownedItem(ctx, id);
	if (item.type !== 'replenish') throw new ValidationError('Only replenish items can be restocked');

	db.update(shoppingItems)
		.set({ bought: false, boughtAt: null, updatedAt: stamp(ctx) })
		.where(itemWhere(ctx, id))
		.run();
}

export function toggleSnoozed(ctx: Ctx, id: number): void {
	const item = ownedItem(ctx, id);
	setSnoozed(ctx, id, !item.snoozed);
}

/**
 * Snoozed, or not, said rather than flipped.
 *
 * A toggle is the right control under a finger and the wrong one for a caller
 * that knows what it wants: "put this back on the list" through a toggle is
 * read-then-flip, which is a race and, worse, silently does the opposite when
 * the read was stale. Everything outside the page itself asks for a state.
 */
export function setSnoozed(ctx: Ctx, id: number, snoozed: boolean): { changed: boolean } {
	const item = ownedItem(ctx, id);
	if (item.snoozed === snoozed) return { changed: false };

	db.update(shoppingItems)
		.set({ snoozed, updatedAt: stamp(ctx) })
		.where(itemWhere(ctx, id))
		.run();
	return { changed: true };
}

function ownedItem(ctx: Ctx, id: number) {
	const row = db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			type: shoppingItems.type,
			bought: shoppingItems.bought,
			snoozed: shoppingItems.snoozed
		})
		.from(shoppingItems)
		.where(itemWhere(ctx, id))
		.get();

	if (!row) throw new NotFoundError('item');
	return row;
}

function parseItem(ctx: Ctx, raw: ItemInput) {
	return {
		name: str(raw.name, 'name', { max: MAX_NAME_LENGTH }),
		type: oneOf(raw.type, 'type', ITEM_TYPES),
		notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
		shoppingCategoryId: parseCategoryId(ctx, raw.shoppingCategoryId),
		// Typed as money, stored as an integer. A blank field means nobody has
		// said what it costs, which is different from saying it is free.
		priceCents: parseMoney(raw.price, getCurrency(ctx.userId))
	};
}

/** Somebody else's drawer is not a place this account may file things in. */
function parseLocationId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'location', { int: true, min: 1 });
	const owned = db
		.select({ id: locations.id })
		.from(locations)
		.where(and(eq(locations.id, id), eq(locations.userId, ctx.userId)))
		.get();
	if (!owned) throw new ValidationError('That is not one of your locations.');
	return id;
}

/**
 * A category id from a form is just a number until it is checked: without this
 * an item could be filed under someone else's category.
 */
function parseCategoryId(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;

	const id = num(value, 'category', { int: true, min: 1 });
	// Yours, or a family member's shared section — filing into a shared shelf
	// is the point of it being shared.
	const reachable = db
		.select({ id: shoppingCategories.id })
		.from(shoppingCategories)
		.where(
			and(
				eq(shoppingCategories.id, id),
				or(
					eq(shoppingCategories.userId, ctx.userId),
					and(
						inArray(shoppingCategories.userId, familyUserIds(ctx.userId)),
						eq(shoppingCategories.sharedWithFamily, true)
					)
				)
			)
		)
		.get();

	if (!reachable) throw new NotFoundError('category');
	return id;
}

/** What is still to buy, for the dashboard card. */
export function listToBuy(ctx: Ctx) {
	return db
		.select({ id: shoppingItems.id, name: shoppingItems.name, type: shoppingItems.type })
		.from(shoppingItems)
		.where(and(itemReach(ctx), eq(shoppingItems.bought, false)))
		.orderBy(desc(shoppingItems.createdAt))
		.all();
}
