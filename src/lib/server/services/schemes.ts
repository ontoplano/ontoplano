import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { planningSchemes, schemeSlots, weeklySlots } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError } from './errors.js';
import { clearWeeklyPlanIn } from './slots.js';
import { stamp, stamps } from './time.js';
import { str } from './validate.js';

/**
 * Saved weeks.
 *
 * A scheme is a snapshot of the weekly plan that can be put back later — a term
 * timetable, a holiday week. Applying one replaces the plan wholesale, which is
 * why it happens inside a transaction: a half-applied week is worse than either
 * of the two it sits between.
 */

export const MAX_NAME_LENGTH = 100;

export function listSchemes(ctx: Ctx) {
	return db
		.select({ id: planningSchemes.id, name: planningSchemes.name })
		.from(planningSchemes)
		.where(eq(planningSchemes.userId, ctx.userId))
		.orderBy(planningSchemes.name)
		.all();
}

export function saveScheme(ctx: Ctx, rawName: unknown): number {
	const name = str(rawName, 'Scheme name', { max: MAX_NAME_LENGTH });

	if (schemeNamed(ctx, name)) throw new ConflictError('A scheme with this name already exists');

	return db.transaction((tx) => {
		const inserted = tx
			.insert(planningSchemes)
			.values({ ...stamps(ctx), userId: ctx.userId, name })
			.run();
		const schemeId = Number(inserted.lastInsertRowid);

		const slots = tx.select().from(weeklySlots).where(eq(weeklySlots.userId, ctx.userId)).all();

		if (slots.length > 0) {
			tx.insert(schemeSlots)
				.values(
					slots.map((slot) => ({
						userId: ctx.userId,
						schemeId,
						weekday: slot.weekday,
						startTime: slot.startTime,
						durationMinutes: slot.durationMinutes,
						mode: slot.mode,
						categoryId: slot.categoryId,
						activityId: slot.activityId,
						label: slot.label,
						active: slot.active
					}))
				)
				.run();
		}

		return schemeId;
	});
}

/** Replace the weekly plan with a saved one. */
export function applyScheme(ctx: Ctx, schemeId: number): void {
	assertOwned(ctx, schemeId);

	db.transaction((tx) => {
		clearWeeklyPlanIn(tx, ctx);

		const slots = tx
			.select()
			.from(schemeSlots)
			.where(eq(schemeSlots.schemeId, schemeId))
			.orderBy(schemeSlots.weekday, schemeSlots.startTime)
			.all();

		if (slots.length > 0) {
			tx.insert(weeklySlots)
				.values(
					slots.map((slot) => ({
						userId: ctx.userId,
						weekday: slot.weekday,
						startTime: slot.startTime,
						durationMinutes: slot.durationMinutes,
						mode: slot.mode,
						categoryId: slot.categoryId,
						activityId: slot.activityId,
						label: slot.label,
						active: slot.active
					}))
				)
				.run();
		}
	});
}

export function deleteScheme(ctx: Ctx, schemeId: number): void {
	const res = db
		.delete(planningSchemes)
		.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('scheme');
}

export function renameScheme(ctx: Ctx, schemeId: number, rawName: unknown): void {
	const name = str(rawName, 'Scheme name', { max: MAX_NAME_LENGTH });

	const clash = schemeNamed(ctx, name);
	if (clash && clash.id !== schemeId)
		throw new ConflictError('A scheme with this name already exists');

	const res = db
		.update(planningSchemes)
		.set({ name, updatedAt: stamp(ctx) })
		.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('scheme');
}

function schemeNamed(ctx: Ctx, name: string) {
	return db
		.select({ id: planningSchemes.id })
		.from(planningSchemes)
		.where(and(eq(planningSchemes.userId, ctx.userId), eq(planningSchemes.name, name)))
		.get();
}

function assertOwned(ctx: Ctx, schemeId: number): void {
	const owned = db
		.select({ id: planningSchemes.id })
		.from(planningSchemes)
		.where(and(eq(planningSchemes.id, schemeId), eq(planningSchemes.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('scheme');
}
