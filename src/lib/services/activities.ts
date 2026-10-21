import { and, count, eq, inArray, isNotNull, max, min, sql } from 'drizzle-orm';

import { CATEGORY_DEFAULT_NEW } from '../colors.js';
import { db } from '$lib/db/index.js';
import {
	activities,
	categories,
	exceptionalTasks,
	goalLinks,
	notebooks,
	planningSchemes,
	recurringTasks,
	schemeSlots,
	taskRecords
} from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';

/**
 * Categories are the areas of a life; activities are the named recurring things
 * inside them. Both are referenced by planner slots and by history. A category
 * cannot be deleted while something still points at it — history that loses
 * its category stops being readable. An activity can: what named it falls back
 * to its category, or moves to another activity (`deleteActivity`).
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

/** The activities page also says what deleting each one would touch. */
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

	const usage = activityUsage(ctx);
	return rows.map((a) => ({ ...a, usage: usage[a.id] ?? emptyUsage() }));
}

export function createActivity(
	ctx: Ctx,
	raw: { name: unknown; categoryId: unknown; description?: unknown }
): number {
	const result = db
		.insert(activities)
		.values({
			...stamps(ctx),
			...stamps(ctx),
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
	setActivityActive(ctx, id, !current.active);
}

/** Switched on or off by saying which, for a caller that should not have to read first. */
export function setActivityActive(ctx: Ctx, id: number, active: boolean): void {
	const res = db
		.update(activities)
		.set({ active, updatedAt: stamp(ctx) })
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('activity');
}

/**
 * Everything that names one activity, for the dialog that deletes it.
 *
 * Blocks are listed one by one, because there are few and each is something a
 * person might rather edit than lose; occurrences are many, so they are a
 * count and the span of days they cover. Goals are not here: the page already
 * has them from `goalBacklinks`.
 */
export type ActivityUsage = {
	weekly: { id: number; weekday: number; recurrence: string; startTime: string; label: string }[];
	once: { id: number; date: string; startTime: string; label: string }[];
	schemes: { id: number; schemeName: string; weekday: number; startTime: string }[];
	records: { count: number; first: string | null; last: string | null };
};

function emptyUsage(): ActivityUsage {
	return { weekly: [], once: [], schemes: [], records: { count: 0, first: null, last: null } };
}

/** The usage of every activity on the account, keyed by activity, in four statements. */
export function activityUsage(ctx: Ctx): Record<number, ActivityUsage> {
	const out: Record<number, ActivityUsage> = {};
	const of = (id: number) => (out[id] ??= emptyUsage());

	for (const row of db
		.select({
			id: recurringTasks.id,
			activityId: recurringTasks.activityId,
			weekday: recurringTasks.weekday,
			recurrence: recurringTasks.recurrence,
			startTime: recurringTasks.startTime,
			label: recurringTasks.label
		})
		.from(recurringTasks)
		.where(and(eq(recurringTasks.userId, ctx.userId), isNotNull(recurringTasks.activityId)))
		.orderBy(recurringTasks.weekday, recurringTasks.startTime)
		.all())
		of(row.activityId!).weekly.push({ ...row, label: row.label ?? '' });

	for (const row of db
		.select({
			id: exceptionalTasks.id,
			activityId: exceptionalTasks.activityId,
			date: exceptionalTasks.date,
			startTime: exceptionalTasks.startTime,
			label: exceptionalTasks.label
		})
		.from(exceptionalTasks)
		.where(and(eq(exceptionalTasks.userId, ctx.userId), isNotNull(exceptionalTasks.activityId)))
		.orderBy(exceptionalTasks.date, exceptionalTasks.startTime)
		.all())
		of(row.activityId!).once.push({ ...row, label: row.label ?? '' });

	for (const row of db
		.select({
			id: schemeSlots.id,
			activityId: schemeSlots.activityId,
			schemeName: planningSchemes.name,
			weekday: schemeSlots.weekday,
			startTime: schemeSlots.startTime
		})
		.from(schemeSlots)
		.innerJoin(planningSchemes, eq(schemeSlots.schemeId, planningSchemes.id))
		.where(and(eq(schemeSlots.userId, ctx.userId), isNotNull(schemeSlots.activityId)))
		.orderBy(planningSchemes.name, schemeSlots.weekday, schemeSlots.startTime)
		.all())
		of(row.activityId!).schemes.push(row);

	for (const row of db
		.select({
			activityId: taskRecords.resolvedActivityId,
			count: count(),
			first: min(taskRecords.scheduledAt),
			last: max(taskRecords.scheduledAt)
		})
		.from(taskRecords)
		.where(and(eq(taskRecords.userId, ctx.userId), isNotNull(taskRecords.resolvedActivityId)))
		.groupBy(taskRecords.resolvedActivityId)
		.all())
		of(row.activityId!).records = {
			count: row.count,
			first: row.first?.slice(0, 10) ?? null,
			last: row.last?.slice(0, 10) ?? null
		};

	return out;
}

/**
 * Where what named a deleted activity goes. Nothing given folds it into the
 * activity's category; `moveTo` hands it to another activity, and `moveToNew`
 * makes that activity first.
 */
export type DeleteActivityOptions = {
	moveTo?: number;
	moveToNew?: { name: unknown; categoryId: unknown };
};

/**
 * Delete an activity, whatever still names it.
 *
 * Nothing is left pointing at a row that is gone, and nothing loses the word
 * it was shown under. Folded, every block that named it becomes a block of its
 * category carrying its name as the label, and every occurrence keeps the
 * name as its own; goals that counted it stop counting it. Moved, all of it —
 * goal links included — names the other activity instead, which is the same
 * as having edited each one by hand.
 */
export function deleteActivity(ctx: Ctx, id: number, opts: DeleteActivityOptions = {}): void {
	db.transaction((tx) => {
		const doomed = tx
			.select({ name: activities.name, categoryId: activities.categoryId })
			.from(activities)
			.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
			.get();
		if (!doomed) throw new NotFoundError('activity');

		const target = opts.moveToNew
			? createActivity(ctx, opts.moveToNew)
			: opts.moveTo !== undefined
				? ownedActivity(ctx, opts.moveTo)
				: null;
		if (opts.moveTo !== undefined && target === null) throw new NotFoundError('activity');
		if (target === id) throw new ValidationError({ key: 'errors.activities.cannotMoveOntoItself' });

		const mine = <T extends typeof recurringTasks | typeof exceptionalTasks | typeof schemeSlots>(
			t: T
		) => and(eq(t.activityId, id), eq(t.userId, ctx.userId));

		if (target !== null) {
			for (const t of [recurringTasks, exceptionalTasks, schemeSlots])
				tx.update(t).set({ activityId: target }).where(mine(t)).run();
			tx.update(taskRecords)
				.set({ resolvedActivityId: target })
				.where(and(eq(taskRecords.resolvedActivityId, id), eq(taskRecords.userId, ctx.userId)))
				.run();

			// A goal already counting the target would count it twice.
			const counting = tx
				.select({ goalId: goalLinks.goalId })
				.from(goalLinks)
				.where(and(eq(goalLinks.activityId, target), eq(goalLinks.userId, ctx.userId)))
				.all()
				.map((row) => row.goalId);
			const links = and(eq(goalLinks.activityId, id), eq(goalLinks.userId, ctx.userId));
			if (counting.length > 0)
				tx.delete(goalLinks)
					.where(and(links, inArray(goalLinks.goalId, counting)))
					.run();
			tx.update(goalLinks).set({ activityId: target }).where(links).run();
		} else {
			const named = sql`CASE WHEN coalesce(label, '') = '' THEN ${doomed.name} ELSE label END`;
			for (const t of [recurringTasks, exceptionalTasks, schemeSlots])
				tx.update(t)
					.set({
						mode: sql`CASE WHEN mode = 'activity' THEN 'category' ELSE mode END`,
						categoryId: sql`CASE WHEN mode = 'activity' THEN ${doomed.categoryId} ELSE category_id END`,
						label: named,
						activityId: null
					})
					.where(mine(t))
					.run();
			// The title an occurrence was shown under is the activity's name, which
			// outranks a block's label; carried as its own, it reads as it did.
			tx.update(taskRecords)
				.set({
					labelOverride: sql`coalesce(label_override, ${doomed.name})`,
					resolvedActivityId: null
				})
				.where(and(eq(taskRecords.resolvedActivityId, id), eq(taskRecords.userId, ctx.userId)))
				.run();
		}

		const res = tx
			.delete(activities)
			.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
			.run();
		if (res.changes === 0) throw new NotFoundError('activity');
	});
}

export function createCategory(ctx: Ctx, raw: { name: unknown; color?: unknown }): number {
	const name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });
	const color = parseColor(raw.color) ?? CATEGORY_DEFAULT_NEW;

	const clash = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.userId, ctx.userId), eq(categories.name, name)))
		.get();

	if (clash) throw new ConflictError({ key: 'errors.activities.categoryAlreadyExists' });

	const result = db
		.insert(categories)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			name,
			color,
			colorLight: lightVariant(color)
		})
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

/**
 * A category id from a form or a call, or null for none — one of this
 * account's own, or a 404.
 */
export function ownedCategory(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'category', { int: true, min: 1 });
	const owned = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('category');
	return id;
}

/**
 * An activity id from a form or a call, or null for none — one of this
 * account's own, or a 404. The planner's three services each had a copy.
 */
export function ownedActivity(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'activity', { int: true, min: 1 });
	const owned = db
		.select({ id: activities.id })
		.from(activities)
		.where(and(eq(activities.id, id), eq(activities.userId, ctx.userId)))
		.get();
	if (!owned) throw new NotFoundError('activity');
	return id;
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
			.from(recurringTasks)
			.where(and(eq(recurringTasks.categoryId, id), eq(recurringTasks.userId, ctx.userId)))
			.get()
	);

	if (activityRefs > 0 || slotRefs > 0)
		throw new ValidationError({ key: 'errors.activities.cannotDeleteCategoryHasActivities' });

	db.transaction((tx) => {
		// A notebook only suggests its category, so losing it is losing the
		// suggestion. The column has no delete action of its own.
		tx.update(notebooks)
			.set({ categoryId: null })
			.where(and(eq(notebooks.categoryId, id), eq(notebooks.userId, ctx.userId)))
			.run();

		const res = tx
			.delete(categories)
			.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
			.run();

		if (res.changes === 0) throw new NotFoundError('category');
	});
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
	if (!HEX_COLOR.test(color))
		throw new ValidationError({ key: 'errors.activities.invalidColorFormat' });
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
