/**
 * Trainings: workouts you plan like meals.
 *
 * A training lives under Health, beside habits and the numbers. It is a named
 * session with a plan (Markdown, like a recipe's method) and a kind, and you
 * put it on the week the way you put a meal there: by attaching it to a block.
 * Scheduling is not modelled here twice — `recurring_tasks.trainingId` and
 * `exceptional_tasks.trainingId` carry it, exactly as `recipeId` carries a
 * meal — so "what does this week ask of me" is one join over the grid, not a
 * separate calendar for exercise.
 *
 * Archived, not deleted, while it has been done: `lastDoneAt` and the blocks
 * that pointed at it are its history. `deleteTraining` is for one made by
 * mistake and clears itself off any block (the FK is set-null).
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { trainings } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError } from './errors.js';
import { stamp, stamps } from './time.js';
import { num, oneOf, optionalStr, str } from './validate.js';

export const KINDS = ['strength', 'cardio', 'mobility', 'sport', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export const MAX_TITLE_LENGTH = 200;
export const MAX_PLAN_LENGTH = 8000;
export const MAX_NOTE_LENGTH = 2000;

export type Training = {
	id: number;
	title: string;
	kind: Kind;
	plan: string;
	notes: string;
	minutes: number | null;
	lastDoneAt: string | null;
	archived: boolean;
};

type TrainingInput = {
	title: unknown;
	kind?: unknown;
	plan?: unknown;
	notes?: unknown;
	minutes?: unknown;
};

function toTraining(t: typeof trainings.$inferSelect): Training {
	return {
		id: t.id,
		title: t.title,
		kind: t.kind as Kind,
		plan: t.plan,
		notes: t.notes ?? '',
		minutes: t.minutes,
		lastDoneAt: t.lastDoneAt,
		archived: t.archivedAt !== null
	};
}

export function listTrainings(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Training[] {
	const where = opts.includeArchived
		? eq(trainings.userId, ctx.userId)
		: and(eq(trainings.userId, ctx.userId), isNull(trainings.archivedAt));
	return db
		.select()
		.from(trainings)
		.where(where)
		.orderBy(asc(trainings.archivedAt), asc(trainings.title))
		.all()
		.map(toTraining);
}

export function getTraining(ctx: Ctx, id: number): Training {
	const found = db
		.select()
		.from(trainings)
		.where(and(eq(trainings.id, id), eq(trainings.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('training');
	return toTraining(found);
}

function fields(input: TrainingInput) {
	return {
		title: str(input.title, 'title', { max: MAX_TITLE_LENGTH }),
		kind: input.kind === undefined ? ('other' as Kind) : oneOf(input.kind, 'kind', KINDS),
		plan: optionalStr(input.plan, 'plan', { max: MAX_PLAN_LENGTH }) || '',
		notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
		minutes:
			input.minutes === undefined || input.minutes === null || input.minutes === ''
				? null
				: num(input.minutes, 'minutes', { int: true, min: 1 })
	};
}

export function createTraining(ctx: Ctx, input: TrainingInput): number {
	const inserted = db
		.insert(trainings)
		.values({ userId: ctx.userId, ...fields(input), ...stamps(ctx) })
		.returning({ id: trainings.id })
		.get();
	return inserted.id;
}

export function updateTraining(ctx: Ctx, id: number, input: TrainingInput): void {
	getTraining(ctx, id); // ownership
	db.update(trainings)
		.set({ ...fields(input), updatedAt: stamp(ctx) })
		.where(and(eq(trainings.id, id), eq(trainings.userId, ctx.userId)))
		.run();
}

export function setArchived(ctx: Ctx, id: number, archived: boolean): void {
	getTraining(ctx, id);
	db.update(trainings)
		.set({ archivedAt: archived ? stamp(ctx) : null, updatedAt: stamp(ctx) })
		.where(and(eq(trainings.id, id), eq(trainings.userId, ctx.userId)))
		.run();
}

/** For one made by mistake: gone, and cleared off any block it was on. */
export function deleteTraining(ctx: Ctx, id: number): void {
	getTraining(ctx, id);
	db.delete(trainings)
		.where(and(eq(trainings.id, id), eq(trainings.userId, ctx.userId)))
		.run();
}

/** Record that a session happened — the "cooked" of the gym. */
export function done(ctx: Ctx, id: number): void {
	getTraining(ctx, id);
	db.update(trainings)
		.set({ lastDoneAt: stamp(ctx), updatedAt: stamp(ctx) })
		.where(and(eq(trainings.id, id), eq(trainings.userId, ctx.userId)))
		.run();
}
