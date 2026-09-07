/**
 * Locations: the tree an inventory hangs on.
 *
 * "Where do we keep the measuring tape?" — "Living room, white chest, first
 * drawer." A location has a parent, so locations nest as deep as a house does, and an
 * item points at the one it lives in. This is the half a flat shopping list
 * does not have; the list stays the "I need it" view of the same items.
 *
 * A location deleted lets its children rise to where it was (the FK is set-null)
 * rather than taking a wing of the house down with it — the same gentleness the
 * rest of the app gives things that took effort to enter.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { locations, shoppingItems } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';

export const MAX_NAME_LENGTH = 120;
export const MAX_NOTE_LENGTH = 2000;

export type Location = {
	id: number;
	name: string;
	parentId: number | null;
	notes: string;
	sortOrder: number;
};

export type LocationNode = Location & { children: LocationNode[]; itemCount: number };

function toLocation(p: typeof locations.$inferSelect): Location {
	return {
		id: p.id,
		name: p.name,
		parentId: p.parentId,
		notes: p.notes ?? '',
		sortOrder: p.sortOrder
	};
}

export function listLocations(ctx: Ctx): Location[] {
	return db
		.select()
		.from(locations)
		.where(eq(locations.userId, ctx.userId))
		.orderBy(asc(locations.sortOrder), asc(locations.name))
		.all()
		.map(toLocation);
}

export function getLocation(ctx: Ctx, id: number): Location {
	const found = db
		.select()
		.from(locations)
		.where(and(eq(locations.id, id), eq(locations.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('location');
	return toLocation(found);
}

/** The whole tree, each node carrying how many items sit directly in it. */
export function locationTree(ctx: Ctx): LocationNode[] {
	const flat = listLocations(ctx);
	const counts = itemCounts(ctx);
	const byId = new Map<number, LocationNode>(
		flat.map((p) => [p.id, { ...p, children: [], itemCount: counts.get(p.id) ?? 0 }])
	);
	const roots: LocationNode[] = [];
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
		.select({ locationId: shoppingItems.locationId })
		.from(shoppingItems)
		.where(eq(shoppingItems.userId, ctx.userId))
		.all();
	const counts = new Map<number, number>();
	for (const r of rows)
		if (r.locationId != null) counts.set(r.locationId, (counts.get(r.locationId) ?? 0) + 1);
	return counts;
}

/** The chain of names from the root down to this location, for "Living room › chest › drawer". */
export function pathOf(ctx: Ctx, id: number): string[] {
	const byId = indexLocations(ctx);
	const chain: string[] = [];
	const seen = new Set<number>();
	let cur: number | null = id;
	while (cur != null && !seen.has(cur)) {
		seen.add(cur);
		const node: Location | undefined = byId.get(cur);
		if (!node) break;
		chain.unshift(node.name);
		cur = node.parentId;
	}
	return chain;
}

/** Locations keyed by id, typed once so callers walk the tree without casts. */
function indexLocations(ctx: Ctx): Map<number, Location> {
	const byId = new Map<number, Location>();
	for (const location of listLocations(ctx)) byId.set(location.id, location);
	return byId;
}

/** A location cannot be moved under itself or one of its own descendants. */
function wouldCycle(ctx: Ctx, id: number, newParent: number): boolean {
	const byId = indexLocations(ctx);
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
	getLocation(ctx, parentId); // ownership, and existence
	if (selfId !== undefined && (parentId === selfId || wouldCycle(ctx, selfId, parentId)))
		throw new ValidationError('A location cannot be inside itself.');
	return parentId;
}

export function createLocation(
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
	return db.insert(locations).values(values).returning({ id: locations.id }).get().id;
}

export function updateLocation(
	ctx: Ctx,
	id: number,
	input: { name?: unknown; parentId?: unknown; notes?: unknown }
): void {
	getLocation(ctx, id); // ownership
	db.update(locations)
		.set({
			name: str(input.name, 'name', { max: MAX_NAME_LENGTH }),
			parentId: ownedParent(ctx, input.parentId, id),
			notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
			updatedAt: stamp(ctx)
		})
		.where(and(eq(locations.id, id), eq(locations.userId, ctx.userId)))
		.run();
}

/**
 * Delete a location. Its children rise to its parent, and any item that lived in
 * it becomes location-less — nothing is destroyed for standing in a room that was
 * removed.
 */
export function deleteLocation(ctx: Ctx, id: number): void {
	const location = getLocation(ctx, id);
	db.update(locations)
		.set({ parentId: location.parentId, updatedAt: stamp(ctx) })
		.where(and(eq(locations.userId, ctx.userId), eq(locations.parentId, id)))
		.run();
	db.delete(locations)
		.where(and(eq(locations.id, id), eq(locations.userId, ctx.userId)))
		.run();
}

/** The top-level locations, for a first "where does this live" choice. */
export function rootLocations(ctx: Ctx): Location[] {
	return db
		.select()
		.from(locations)
		.where(and(eq(locations.userId, ctx.userId), isNull(locations.parentId)))
		.orderBy(asc(locations.sortOrder), asc(locations.name))
		.all()
		.map(toLocation);
}
