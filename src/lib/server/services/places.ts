/**
 * Places: the tree an inventory hangs on.
 *
 * "Where do we keep the measuring tape?" — "Living room, white chest, first
 * drawer." A place has a parent, so places nest as deep as a house does, and an
 * item points at the one it lives in. This is the half a flat shopping list
 * does not have; the list stays the "I need it" view of the same items.
 *
 * A place deleted lets its children rise to where it was (the FK is set-null)
 * rather than taking a wing of the house down with it — the same gentleness the
 * rest of the app gives things that took effort to enter.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { places, shoppingItems } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';

export const MAX_NAME_LENGTH = 120;
export const MAX_NOTE_LENGTH = 2000;

export type Place = {
	id: number;
	name: string;
	parentId: number | null;
	notes: string;
	sortOrder: number;
};

export type PlaceNode = Place & { children: PlaceNode[]; itemCount: number };

function toPlace(p: typeof places.$inferSelect): Place {
	return {
		id: p.id,
		name: p.name,
		parentId: p.parentId,
		notes: p.notes ?? '',
		sortOrder: p.sortOrder
	};
}

export function listPlaces(ctx: Ctx): Place[] {
	return db
		.select()
		.from(places)
		.where(eq(places.userId, ctx.userId))
		.orderBy(asc(places.sortOrder), asc(places.name))
		.all()
		.map(toPlace);
}

export function getPlace(ctx: Ctx, id: number): Place {
	const found = db
		.select()
		.from(places)
		.where(and(eq(places.id, id), eq(places.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('place');
	return toPlace(found);
}

/** The whole tree, each node carrying how many items sit directly in it. */
export function placeTree(ctx: Ctx): PlaceNode[] {
	const flat = listPlaces(ctx);
	const counts = itemCounts(ctx);
	const byId = new Map<number, PlaceNode>(
		flat.map((p) => [p.id, { ...p, children: [], itemCount: counts.get(p.id) ?? 0 }])
	);
	const roots: PlaceNode[] = [];
	for (const node of byId.values()) {
		if (node.parentId !== null && byId.has(node.parentId)) {
			byId.get(node.parentId)!.children.push(node);
		} else {
			roots.push(node);
		}
	}
	return roots;
}

function itemCounts(ctx: Ctx): Map<number, number> {
	const rows = db
		.select({ placeId: shoppingItems.placeId })
		.from(shoppingItems)
		.where(eq(shoppingItems.userId, ctx.userId))
		.all();
	const counts = new Map<number, number>();
	for (const r of rows)
		if (r.placeId != null) counts.set(r.placeId, (counts.get(r.placeId) ?? 0) + 1);
	return counts;
}

/** The chain of names from the root down to this place, for "Living room › chest › drawer". */
export function pathOf(ctx: Ctx, id: number): string[] {
	const byId = indexPlaces(ctx);
	const chain: string[] = [];
	const seen = new Set<number>();
	let cur: number | null = id;
	while (cur != null && !seen.has(cur)) {
		seen.add(cur);
		const node: Place | undefined = byId.get(cur);
		if (!node) break;
		chain.unshift(node.name);
		cur = node.parentId;
	}
	return chain;
}

/** Places keyed by id, typed once so callers walk the tree without casts. */
function indexPlaces(ctx: Ctx): Map<number, Place> {
	const byId = new Map<number, Place>();
	for (const place of listPlaces(ctx)) byId.set(place.id, place);
	return byId;
}

/** A place cannot be moved under itself or one of its own descendants. */
function wouldCycle(ctx: Ctx, id: number, newParent: number): boolean {
	const byId = indexPlaces(ctx);
	const seen = new Set<number>();
	let cur: number | null = newParent;
	while (cur != null && !seen.has(cur)) {
		if (cur === id) return true;
		seen.add(cur);
		cur = byId.get(cur)?.parentId ?? null;
	}
	return false;
}

function ownedParent(ctx: Ctx, value: unknown, selfId?: number): number | null {
	if (value === undefined || value === null || value === '') return null;
	const parentId = num(value, 'parent', { int: true });
	getPlace(ctx, parentId); // ownership, and existence
	if (selfId !== undefined && (parentId === selfId || wouldCycle(ctx, selfId, parentId)))
		throw new ValidationError('A place cannot be inside itself.');
	return parentId;
}

export function createPlace(
	ctx: Ctx,
	input: { name: unknown; parentId?: unknown; notes?: unknown }
): number {
	const values = {
		userId: ctx.userId,
		name: str(input.name, 'name', { max: MAX_NAME_LENGTH }),
		parentId: ownedParent(ctx, input.parentId),
		notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
		...stamps(ctx)
	};
	return db.insert(places).values(values).returning({ id: places.id }).get().id;
}

export function updatePlace(
	ctx: Ctx,
	id: number,
	input: { name?: unknown; parentId?: unknown; notes?: unknown }
): void {
	getPlace(ctx, id); // ownership
	db.update(places)
		.set({
			name: str(input.name, 'name', { max: MAX_NAME_LENGTH }),
			parentId: ownedParent(ctx, input.parentId, id),
			notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
			updatedAt: stamp(ctx)
		})
		.where(and(eq(places.id, id), eq(places.userId, ctx.userId)))
		.run();
}

/**
 * Delete a place. Its children rise to its parent, and any item that lived in
 * it becomes place-less — nothing is destroyed for standing in a room that was
 * removed.
 */
export function deletePlace(ctx: Ctx, id: number): void {
	const place = getPlace(ctx, id);
	db.update(places)
		.set({ parentId: place.parentId, updatedAt: stamp(ctx) })
		.where(and(eq(places.userId, ctx.userId), eq(places.parentId, id)))
		.run();
	db.delete(places)
		.where(and(eq(places.id, id), eq(places.userId, ctx.userId)))
		.run();
}

/** The top-level places, for a first "where does this live" choice. */
export function rootPlaces(ctx: Ctx): Place[] {
	return db
		.select()
		.from(places)
		.where(and(eq(places.userId, ctx.userId), isNull(places.parentId)))
		.orderBy(asc(places.sortOrder), asc(places.name))
		.all()
		.map(toPlace);
}
