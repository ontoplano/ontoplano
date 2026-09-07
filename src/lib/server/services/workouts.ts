/**
 * Workouts: workouts you plan like meals.
 *
 * A workout lives under Health, beside habits and the numbers. It is a named
 * session with a plan (Markdown, like a recipe's method) and a kind, and you
 * put it on the week the way you put a meal there: by attaching it to a block.
 * Scheduling is not modelled here twice — `recurring_tasks.workoutId` and
 * `exceptional_tasks.workoutId` carry it, exactly as `recipeId` carries a
 * meal — so "what does this week ask of me" is one join over the grid, not a
 * separate calendar for exercise.
 *
 * Archived, not deleted, while it has been done: `lastDoneAt` and the blocks
 * that pointed at it are its history. `deleteWorkout` is for one made by
 * mistake and clears itself off any block (the FK is set-null).
 */
import { and, asc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { exceptionalTasks, workoutCategories, workouts } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, optionalStr, str } from './validate.js';
import { createExceptional } from './slots.js';
import { setOccurrenceStatus } from './instances.js';

/**
 * What a new account starts with, and nothing more.
 *
 * These were an enum in the schema, which is somebody else deciding what your
 * training is made of — and "other" being the fifth is the proof it did not
 * fit. They are rows now: this list only seeds them, and an account is free to
 * rename, add to and remove them afterwards.
 */
export const STARTING_CATEGORIES = ['Strength', 'Cardio', 'Mobility', 'Sport', 'Other'] as const;

export type WorkoutCategory = { id: number; name: string; sortOrder: number };

export const MAX_TITLE_LENGTH = 200;
export const MAX_PLAN_LENGTH = 8000;
export const MAX_NOTE_LENGTH = 2000;

export type Workout = {
	id: number;
	title: string;
	categoryId: number | null;
	categoryName: string | null;
	plan: string;
	notes: string;
	minutes: number | null;
	lastDoneAt: string | null;
	archived: boolean;
};

type WorkoutInput = {
	title: unknown;
	categoryId?: unknown;
	plan?: unknown;
	notes?: unknown;
	minutes?: unknown;
};

function toWorkout(t: typeof workouts.$inferSelect & { categoryName?: string | null }): Workout {
	return {
		id: t.id,
		title: t.title,
		categoryId: t.categoryId,
		categoryName: t.categoryName ?? null,
		plan: t.plan,
		notes: t.notes ?? '',
		minutes: t.minutes,
		lastDoneAt: t.lastDoneAt,
		archived: t.archivedAt !== null
	};
}

export function listWorkouts(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Workout[] {
	const where = opts.includeArchived
		? eq(workouts.userId, ctx.userId)
		: and(eq(workouts.userId, ctx.userId), isNull(workouts.archivedAt));
	return db
		.select({ ...getTableColumns(workouts), categoryName: workoutCategories.name })
		.from(workouts)
		.leftJoin(workoutCategories, eq(workouts.categoryId, workoutCategories.id))
		.where(where)
		.orderBy(asc(workouts.archivedAt), asc(workouts.title))
		.all()
		.map(toWorkout);
}

/**
 * The kinds this account keeps, and the five it starts with.
 *
 * Made on first sight rather than at registration: an account that predates
 * the table, or one whose list somebody emptied and wants back, gets them the
 * next time the page is opened. Adding by hand afterwards is the point of the
 * table, so this only fills an empty list — it never puts back one that was
 * deliberately shortened.
 */
export function listWorkoutCategories(ctx: Ctx): WorkoutCategory[] {
	const found = db
		.select({
			id: workoutCategories.id,
			name: workoutCategories.name,
			sortOrder: workoutCategories.sortOrder
		})
		.from(workoutCategories)
		.where(eq(workoutCategories.userId, ctx.userId))
		.orderBy(asc(workoutCategories.sortOrder), asc(workoutCategories.name))
		.all();
	if (found.length > 0) return found;

	db.insert(workoutCategories)
		.values(STARTING_CATEGORIES.map((name, i) => ({ userId: ctx.userId, name, sortOrder: i })))
		.run();
	return listWorkoutCategories(ctx);
}

export function createWorkoutCategory(ctx: Ctx, name: unknown): number {
	const clean = str(name, 'name', { max: 60 });
	const existing = db
		.select({ id: workoutCategories.id })
		.from(workoutCategories)
		.where(
			and(
				eq(workoutCategories.userId, ctx.userId),
				sql`lower(${workoutCategories.name}) = lower(${clean})`
			)
		)
		.get();
	if (existing) return existing.id;

	const count = db
		.select({ n: sql<number>`count(*)` })
		.from(workoutCategories)
		.where(eq(workoutCategories.userId, ctx.userId))
		.get();
	return db
		.insert(workoutCategories)
		.values({ userId: ctx.userId, name: clean, sortOrder: count?.n ?? 0 })
		.returning({ id: workoutCategories.id })
		.get().id;
}

export function renameWorkoutCategory(ctx: Ctx, id: number, name: unknown): void {
	const clean = str(name, 'name', { max: 60 });
	const res = db
		.update(workoutCategories)
		.set({ name: clean })
		.where(and(eq(workoutCategories.id, id), eq(workoutCategories.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('workout category');
}

/** Removed; the workouts in it keep existing and simply have no kind. */
export function deleteWorkoutCategory(ctx: Ctx, id: number): void {
	const res = db
		.delete(workoutCategories)
		.where(and(eq(workoutCategories.id, id), eq(workoutCategories.userId, ctx.userId)))
		.run();
	if (res.changes === 0) throw new NotFoundError('workout category');
}

/** Somebody else's list is not one this account may file a workout under. */
function ownedCategory(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'kind', { int: true, min: 1 });
	const owned = db
		.select({ id: workoutCategories.id })
		.from(workoutCategories)
		.where(and(eq(workoutCategories.id, id), eq(workoutCategories.userId, ctx.userId)))
		.get();
	if (!owned) throw new ValidationError('That is not one of your workout kinds.');
	return id;
}

export function getWorkout(ctx: Ctx, id: number): Workout {
	const found = db
		.select({ ...getTableColumns(workouts), categoryName: workoutCategories.name })
		.from(workouts)
		.leftJoin(workoutCategories, eq(workouts.categoryId, workoutCategories.id))
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('workout');
	return toWorkout(found);
}

function fields(ctx: Ctx, input: WorkoutInput) {
	return {
		title: str(input.title, 'title', { max: MAX_TITLE_LENGTH }),
		categoryId: ownedCategory(ctx, input.categoryId),
		plan: optionalStr(input.plan, 'plan', { max: MAX_PLAN_LENGTH }) || '',
		notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
		minutes:
			input.minutes === undefined || input.minutes === null || input.minutes === ''
				? null
				: num(input.minutes, 'minutes', { int: true, min: 1 })
	};
}

export function createWorkout(ctx: Ctx, input: WorkoutInput): number {
	const inserted = db
		.insert(workouts)
		.values({ userId: ctx.userId, ...fields(ctx, input), ...stamps(ctx) })
		.returning({ id: workouts.id })
		.get();
	return inserted.id;
}

export function updateWorkout(ctx: Ctx, id: number, input: WorkoutInput): void {
	getWorkout(ctx, id); // ownership
	db.update(workouts)
		.set({ ...fields(ctx, input), updatedAt: stamp(ctx) })
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
}

export function setArchived(ctx: Ctx, id: number, archived: boolean): void {
	getWorkout(ctx, id);
	db.update(workouts)
		.set({ archivedAt: archived ? stamp(ctx) : null, updatedAt: stamp(ctx) })
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
}

/** For one made by mistake: gone, and cleared off any block it was on. */
export function deleteWorkout(ctx: Ctx, id: number): void {
	getWorkout(ctx, id);
	db.delete(workouts)
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
}

/** Record that a session happened — the "cooked" of the gym. */
export function done(ctx: Ctx, id: number): void {
	getWorkout(ctx, id);
	db.update(workouts)
		.set({ lastDoneAt: stamp(ctx), updatedAt: stamp(ctx) })
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
}

/**
 * Put a workout on a day.
 *
 * The same gesture a todo has, and the same result: a one-off block on the
 * grid whose mode says it IS this workout. Nothing is copied — the block
 * points at the workout, so the plan and the workout cannot drift, and
 * finishing either finishes both.
 */
export function scheduleWorkout(
	ctx: Ctx,
	id: number,
	input: { date: unknown; startTime: unknown; durationMinutes?: unknown; categoryId?: unknown }
): number {
	const workout = getWorkout(ctx, id);
	return createExceptional(ctx, {
		date: input.date,
		startTime: input.startTime,
		// Its typical length is the sensible default for the block.
		durationMinutes: input.durationMinutes ?? workout.minutes ?? 60,
		mode: 'workout',
		workoutId: id,
		categoryId: input.categoryId,
		label: workout.title
	});
}

/**
 * The workout was done — and so, if it was on today's plan, was the block.
 *
 * The inverse of the binding in `setInstanceStatus`: ticking Done in Health
 * must not leave the week still asking for it. Only today's occurrence, and
 * only one: a workout done on Tuesday says nothing about Thursday's.
 */
export function doneToday(ctx: Ctx, id: number): void {
	done(ctx, id);

	const today = stamp(ctx).slice(0, 10);
	const block = db
		.select({ id: exceptionalTasks.id })
		.from(exceptionalTasks)
		.where(
			and(
				eq(exceptionalTasks.userId, ctx.userId),
				eq(exceptionalTasks.workoutId, id),
				eq(exceptionalTasks.date, today)
			)
		)
		.get();
	if (block) setOccurrenceStatus(ctx, `exceptional:${block.id}`, 'done');
}
