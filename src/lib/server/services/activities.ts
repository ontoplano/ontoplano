import { and, count, eq } from 'drizzle-orm';

import { CATEGORY_DEFAULT_NEW } from '../../colors.js';
import { db } from '../db/index.js';
import { activities, categories, taskInstances, weeklySlots } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { stamp } from './time.js';
import { num, optionalStr, str } from './validate.js';

/**
 * Categories are the areas of a life; activities are the named recurring things
 * inside them. Both are referenced by planner slots and by history, so neither
 * can be deleted while something still points at it — history that loses its
 * category stops being readable.
 */

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function listCategories(ctx: Ctx) {
	return db.select().from(categories).where(eq(categories.userId, ctx.userId)).all();
}

export function listActivities(ctx: Ctx, opts: { activeOnly?: boolean } = {}) {
	const where = opts.activeOnly
		? and(eq(activities.userId, ctx.userId), eq(activities.active, true))
		: eq(activities.userId, ctx.userId);

	return db.select().from(activities).where(where).orderBy(activities.name).all();
}

/** The activities page also wants to know what may be deleted. */
export function listActivitiesWithUsage(ctx: Ctx) {
	const rows = db
		.select({
			id: activities.id,
			name: activities.name,
			categoryId: activities.categoryId,
			categoryName: categories.name,
			description: activities.description,
			color: activities.color,
			active: activities.active,
			createdAt: activities.createdAt
		})
		.from(activities)
		.leftJoin(categories, eq(activities.categoryId, categories.id))
		.where(eq(activities.userId, ctx.userId))
		.orderBy(activities.name)
		.all();

	return rows.map((a) => ({ ...a, hasReferences: activityReferences(ctx, a.id) > 0 }));
}

export function createActivity(
	ctx: Ctx,
	raw: { name: unknown; categoryId: unknown; description?: unknown }
): number {
	const result = db
		.insert(activities)
		.values({
			userId: ctx.userId,
			name: str(raw.name, 'name', { max: MAX_NAME_LENGTH }),
			categoryId: requireCategory(ctx, raw.categoryId),
			description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH })
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updateActivity(
	ctx: Ctx,
	id: number,
	raw: { name: unknown; categoryId: unknown; description?: unknown }
): void {
	const res = db
		.update(activities)
		.set({
			name: str(raw.name, 'name', { max: MAX_NAME_LENGTH }),
			categoryId: requireCategory(ctx, raw.categoryId),
			description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH }),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('activity');
}

/** Retiring an activity keeps its history; deleting it would not. */
export function toggleActivityActive(ctx: Ctx, id: number): void {
	const current = db
		.select({ active: activities.active })
		.from(activities)
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.get();

	if (!current) throw new NotFoundError('activity');

	db.update(activities)
		.set({ active: !current.active, updatedAt: stamp(ctx) })
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.run();
}

export function deleteActivity(ctx: Ctx, id: number): void {
	if (activityReferences(ctx, id) > 0)
		throw new ValidationError(
			'Cannot delete: activity is referenced by planner slots or task history'
		);

	const res = db
		.delete(activities)
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('activity');
}

export function createCategory(ctx: Ctx, raw: { name: unknown; color?: unknown }): number {
	const name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });
	const color = parseColor(raw.color) ?? CATEGORY_DEFAULT_NEW;

	const clash = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.userId, ctx.userId), eq(categories.name, name)))
		.get();

	if (clash) throw new ConflictError('Category already exists');

	const result = db
		.insert(categories)
		.values({ userId: ctx.userId, name, color, colorLight: lightVariant(color) })
		.run();

	return Number(result.lastInsertRowid);
}

export function updateCategory(
	ctx: Ctx,
	id: number,
	raw: { name?: unknown; color?: unknown }
): void {
	const updates: Record<string, string> = {};

	if (raw.name !== undefined && raw.name !== null && String(raw.name).trim() !== '')
		updates.name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });

	const color = parseColor(raw.color);
	if (color) {
		updates.color = color;
		updates.colorLight = lightVariant(color);
	}

	// Nothing to change is not an error — the form posts both fields whether or
	// not either was touched.
	if (Object.keys(updates).length === 0) {
		assertOwnedCategory(ctx, id);
		return;
	}

	const res = db
		.update(categories)
		.set(updates)
		.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('category');
}

export function deleteCategory(ctx: Ctx, id: number): void {
	const activityRefs = countRows(
		db
			.select({ cnt: count() })
			.from(activities)
			.where(and(eq(activities.categoryId, id), eq(activities.userId, ctx.userId)))
			.get()
	);
	const slotRefs = countRows(
		db
			.select({ cnt: count() })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.categoryId, id), eq(weeklySlots.userId, ctx.userId)))
			.get()
	);

	if (activityRefs > 0 || slotRefs > 0)
		throw new ValidationError('Cannot delete: category has activities or planner slots');

	const res = db
		.delete(categories)
		.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('category');
}

function activityReferences(ctx: Ctx, id: number): number {
	const slotRefs = countRows(
		db
			.select({ cnt: count() })
			.from(weeklySlots)
			.where(and(eq(weeklySlots.activityId, id), eq(weeklySlots.userId, ctx.userId)))
			.get()
	);
	const instanceRefs = countRows(
		db
			.select({ cnt: count() })
			.from(taskInstances)
			.where(and(eq(taskInstances.resolvedActivityId, id), eq(taskInstances.userId, ctx.userId)))
			.get()
	);

	return slotRefs + instanceRefs;
}

function countRows(row: { cnt: number } | undefined): number {
	return row?.cnt ?? 0;
}

function assertOwnedCategory(ctx: Ctx, id: number): void {
	const owned = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('category');
}

function requireCategory(ctx: Ctx, value: unknown): number {
	const id = num(value, 'category', { int: true, min: 1 });
	assertOwnedCategory(ctx, id);
	return id;
}

function parseColor(value: unknown): string | null {
	if (value === undefined || value === null || String(value).trim() === '') return null;
	const color = String(value).trim();
	if (!HEX_COLOR.test(color)) throw new ValidationError('Invalid color format');
	return color;
}

/** The pale companion to a category colour, used behind blocks on the grid. */
function lightVariant(hex: string): string {
	const mix = (channel: number) => Math.round(channel + (255 - channel) * 0.85);
	const r = mix(parseInt(hex.slice(1, 3), 16));
	const g = mix(parseInt(hex.slice(3, 5), 16));
	const b = mix(parseInt(hex.slice(5, 7), 16));
	const hexOf = (n: number) => n.toString(16).padStart(2, '0');
	return `#${hexOf(r)}${hexOf(g)}${hexOf(b)}`;
}
