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
import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import {
	exceptionalTasks,
	workoutCategories,
	workoutMeasures,
	workoutPlanMeasures,
	workoutSessions,
	workouts
} from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { notebookPatch } from './notebooks.js';
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

/** What somebody did, in their words, and the unit they said it in. */
export const MAX_ACTIVITY_LENGTH = 120;
export const MAX_UNIT_LENGTH = 20;

/**
 * How many lines one session may hold.
 *
 * Generous rather than tight — a lifting session is genuinely a dozen lines —
 * and there only so that a form cannot post ten thousand rows.
 */
export const MAX_MEASURES_PER_SESSION = 50;

/**
 * The biggest number a measure may carry.
 *
 * Nothing here knows what a kilometre is, so the only honest bound is one no
 * real body reaches in any unit anybody would use.
 */
export const MAX_AMOUNT = 1_000_000;

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
	/** The subject it belongs to, if any. */
	notebookId: number | null;
	/**
	 * What this workout measures, as names without numbers.
	 *
	 * A suggestion rather than a rule: writing a session down starts from
	 * these, and a session may still measure anything.
	 */
	measures: { activity: string; unit: string }[];
};

/** One line of a session: ran 5 km, deadlifted 120 kg, did the routine. */
export type Measure = {
	id: number;
	activity: string;
	amount: number | null;
	unit: string;
};

export type Session = {
	id: number;
	workoutId: number;
	workoutTitle: string;
	doneOn: string;
	notes: string;
	measures: Measure[];
};

export type MeasureInput = { activity: unknown; amount?: unknown; unit?: unknown };

export type SessionInput = {
	doneOn?: unknown;
	notes?: unknown;
	measures?: MeasureInput[] | unknown;
};

type WorkoutInput = {
	title: unknown;
	categoryId?: unknown;
	plan?: unknown;
	notes?: unknown;
	minutes?: unknown;
	/** The subject it belongs to, when it is part of one. */
	notebookId?: unknown;
	/** What it measures. Left out means "leave what it has". */
	measures?: { activity: unknown; unit?: unknown }[] | unknown;
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
		archived: t.archivedAt !== null,
		notebookId: t.notebookId,
		measures: []
	};
}

/**
 * Hang each workout's declared measures off it, in one query.
 *
 * One `IN` rather than a query per workout, the same shape the sessions use
 * for their lines and the notebooks use for a note's tags.
 */
function withMeasures(rows: Workout[]): Workout[] {
	if (rows.length === 0) return rows;
	const declared = db
		.select({
			workoutId: workoutPlanMeasures.workoutId,
			activity: workoutPlanMeasures.activity,
			unit: workoutPlanMeasures.unit
		})
		.from(workoutPlanMeasures)
		.where(
			inArray(
				workoutPlanMeasures.workoutId,
				rows.map((row) => row.id)
			)
		)
		.orderBy(asc(workoutPlanMeasures.sortOrder), asc(workoutPlanMeasures.id))
		.all();

	const byWorkout = new Map<number, { activity: string; unit: string }[]>();
	for (const row of declared) {
		const held = byWorkout.get(row.workoutId) ?? [];
		held.push({ activity: row.activity, unit: row.unit });
		byWorkout.set(row.workoutId, held);
	}
	return rows.map((row) => ({ ...row, measures: byWorkout.get(row.id) ?? [] }));
}

/**
 * The workouts, all of them or one subject's.
 *
 * `notebookId` narrows rather than changing the shape: a notebook's Workouts
 * tab is this room looking at one subject and draws the rows with the same
 * component, so it needs exactly what the room needs.
 */
export function listWorkouts(
	ctx: Ctx,
	opts: { includeArchived?: boolean; notebookId?: number } = {}
): Workout[] {
	const where = and(
		eq(workouts.userId, ctx.userId),
		opts.includeArchived ? undefined : isNull(workouts.archivedAt),
		opts.notebookId === undefined ? undefined : eq(workouts.notebookId, opts.notebookId)
	);
	const rows = db
		.select({ ...getTableColumns(workouts), categoryName: workoutCategories.name })
		.from(workouts)
		.leftJoin(workoutCategories, eq(workouts.categoryId, workoutCategories.id))
		.where(where)
		.orderBy(asc(workouts.archivedAt), asc(workouts.title))
		.all()
		.map(toWorkout);
	return withMeasures(rows);
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
	if (!owned) throw new ValidationError({ key: 'errors.workouts.thatIsNotOne' });
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
	return withMeasures([toWorkout(found)])[0];
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
				: num(input.minutes, 'minutes', { int: true, min: 1 }),
		// Only when the caller mentioned it — see `notebookPatch`.
		...notebookPatch(ctx, input)
	};
}

export function createWorkout(ctx: Ctx, input: WorkoutInput): number {
	const inserted = db
		.insert(workouts)
		.values({ userId: ctx.userId, ...fields(ctx, input), ...stamps(ctx) })
		.returning({ id: workouts.id })
		.get();
	if (input.measures !== undefined) setWorkoutMeasures(ctx, inserted.id, input.measures);
	return inserted.id;
}

export function updateWorkout(ctx: Ctx, id: number, input: WorkoutInput): void {
	getWorkout(ctx, id); // ownership
	db.update(workouts)
		.set({ ...fields(ctx, input), updatedAt: stamp(ctx) })
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
	if (input.measures !== undefined) setWorkoutMeasures(ctx, id, input.measures);
}

/**
 * Declare what this workout measures: names and units, no numbers.
 *
 * Replaced wholesale rather than diffed, for the same reason a session's lines
 * are — it is one short list somebody edits as a block, and matching rows up
 * by id would be work in aid of nothing. A blank row is one that was opened
 * and abandoned, not an error.
 */
export function setWorkoutMeasures(ctx: Ctx, workoutId: number, raw: unknown): void {
	getWorkout(ctx, workoutId); // ownership

	if (raw !== undefined && raw !== null && !Array.isArray(raw))
		throw new ValidationError({ key: 'errors.workouts.measuresHave' });
	const rows = ((raw ?? []) as { activity?: unknown; unit?: unknown }[])
		.filter((row) => row && String(row.activity ?? '').trim() !== '')
		.map((row) => ({
			activity: str(row.activity, 'activity', { max: MAX_ACTIVITY_LENGTH }),
			unit: optionalStr(row.unit, 'unit', { max: MAX_UNIT_LENGTH }) || ''
		}));
	if (rows.length > MAX_MEASURES_PER_SESSION)
		throw new ValidationError(`A workout takes at most ${MAX_MEASURES_PER_SESSION} measures`);

	db.delete(workoutPlanMeasures)
		.where(
			and(eq(workoutPlanMeasures.workoutId, workoutId), eq(workoutPlanMeasures.userId, ctx.userId))
		)
		.run();

	if (rows.length === 0) return;
	db.insert(workoutPlanMeasures)
		.values(
			rows.map((row, index) => ({
				userId: ctx.userId,
				workoutId,
				activity: row.activity,
				unit: row.unit,
				sortOrder: index
			}))
		)
		.run();
}

export function setArchived(ctx: Ctx, id: number, archived: boolean): void {
	getWorkout(ctx, id);
	db.update(workouts)
		.set({ archivedAt: archived ? stamp(ctx) : null, updatedAt: stamp(ctx) })
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
}

/**
 * For one made by mistake: gone, and cleared off any block it was on.
 *
 * Refused once it has been done, because the sessions behind it are the
 * record of what somebody actually did and deleting the plan would take them
 * with it. A plan with history is archived — it leaves the list and keeps
 * everything it knows.
 */
export function deleteWorkout(ctx: Ctx, id: number): void {
	getWorkout(ctx, id);

	const sessions = db
		.select({ count: sql<number>`count(*)` })
		.from(workoutSessions)
		.where(and(eq(workoutSessions.workoutId, id), eq(workoutSessions.userId, ctx.userId)))
		.get();
	if (sessions && sessions.count > 0)
		throw new ValidationError(
			`That workout has ${sessions.count} session${sessions.count === 1 ? '' : 's'} recorded against it. Archive it instead — deleting it would take them too.`
		);

	db.delete(workouts)
		.where(and(eq(workouts.id, id), eq(workouts.userId, ctx.userId)))
		.run();
}

/**
 * Record that a session happened — the "cooked" of the gym.
 *
 * Writes a session with nothing measured: ticking Done says it happened, and
 * saying how much of what is `logWorkout`. `lastDoneAt` is kept in step
 * because half the app reads it to answer "when did I last do this", and a
 * count over the sessions would be the same answer at more cost.
 */
export function done(ctx: Ctx, id: number, on?: string): number {
	getWorkout(ctx, id);
	return ensureSession(ctx, id, on ?? stamp(ctx).slice(0, 10));
}

/**
 * A session for this workout on this day, made only if there is not one.
 *
 * Two paths say a workout happened — the Done button in Health, and ticking
 * its block off on the week — and the first calls the second, so an
 * unconditional insert would write the same session twice for one press. The
 * explicit form (`logWorkout`) always inserts, which is what somebody
 * recording two runs in a day wants; this is the quick tick, and a tick is
 * about a day.
 */
export function ensureSession(ctx: Ctx, workoutId: number, doneOn: string): number {
	const existing = db
		.select({ id: workoutSessions.id })
		.from(workoutSessions)
		.where(
			and(
				eq(workoutSessions.workoutId, workoutId),
				eq(workoutSessions.userId, ctx.userId),
				eq(workoutSessions.doneOn, doneOn)
			)
		)
		.get();
	if (existing) {
		touchLastDone(ctx, workoutId);
		return existing.id;
	}

	const inserted = db
		.insert(workoutSessions)
		.values({ userId: ctx.userId, workoutId, doneOn, notes: '', ...stamps(ctx) })
		.returning({ id: workoutSessions.id })
		.get();

	touchLastDone(ctx, workoutId);
	return inserted.id;
}

/**
 * `lastDoneAt` is the newest session there is, recomputed rather than assumed.
 *
 * Logging a session for last Tuesday must not claim the workout was done
 * today, and deleting the most recent one must move the date back rather than
 * leave it pointing at something that no longer exists.
 */
function touchLastDone(ctx: Ctx, workoutId: number): void {
	const newest = db
		.select({ doneOn: workoutSessions.doneOn })
		.from(workoutSessions)
		.where(and(eq(workoutSessions.workoutId, workoutId), eq(workoutSessions.userId, ctx.userId)))
		.orderBy(desc(workoutSessions.doneOn))
		.get();

	db.update(workouts)
		.set({ lastDoneAt: newest?.doneOn ?? null, updatedAt: stamp(ctx) })
		.where(and(eq(workouts.id, workoutId), eq(workouts.userId, ctx.userId)))
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

/*
 * The register: what was actually done, and how much of it.
 *
 * `lastDoneAt` answers "am I keeping this up" and cannot answer "am I getting
 * stronger". These rows are the second question — a day, and lines of
 * activity, amount and unit in the person's own words, so a chart can be drawn
 * over them later without anything here having to know what a kilometre is.
 *
 * Everything is optional. A session with no lines is a session that happened;
 * a line with no amount is "did the mobility routine", which is a real thing
 * to have done and would otherwise go back into a notes field where nothing
 * can read it.
 */

/** A date the register accepts: the day it happened, not a timestamp. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function measureRows(raw: unknown): { activity: string; amount: number | null; unit: string }[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) throw new ValidationError({ key: 'errors.workouts.measuresHave' });
	if (raw.length > MAX_MEASURES_PER_SESSION)
		throw new ValidationError(`A session takes at most ${MAX_MEASURES_PER_SESSION} lines`);

	return (
		raw
			// A blank line is somebody who opened a row and did not fill it in, which
			// is not an error — it is a row they changed their mind about.
			.filter((row) => row && String((row as MeasureInput).activity ?? '').trim() !== '')
			.map((row) => {
				const input = row as MeasureInput;
				const amount =
					input.amount === undefined || input.amount === null || input.amount === ''
						? null
						: num(input.amount, 'amount', { min: 0, max: MAX_AMOUNT });
				return {
					activity: str(input.activity, 'activity', { max: MAX_ACTIVITY_LENGTH }),
					amount,
					unit: optionalStr(input.unit, 'unit', { max: MAX_UNIT_LENGTH }) || ''
				};
			})
	);
}

function writeMeasures(ctx: Ctx, sessionId: number, raw: unknown): void {
	const rows = measureRows(raw);

	// Replaced wholesale rather than diffed: a session's lines are one thing
	// somebody edits as a block, and matching them up by id would be work in
	// aid of nothing.
	db.delete(workoutMeasures)
		.where(and(eq(workoutMeasures.sessionId, sessionId), eq(workoutMeasures.userId, ctx.userId)))
		.run();

	if (rows.length === 0) return;
	db.insert(workoutMeasures)
		.values(
			rows.map((row, index) => ({
				userId: ctx.userId,
				sessionId,
				activity: row.activity,
				amount: row.amount,
				unit: row.unit,
				sortOrder: index
			}))
		)
		.run();
}

function dayOf(ctx: Ctx, value: unknown): string {
	if (value === undefined || value === null || value === '') return stamp(ctx).slice(0, 10);
	return str(value, 'date', { max: 10, pattern: DAY_PATTERN });
}

/** Write down a session: the day, anything noted, and the lines. */
export function logWorkout(ctx: Ctx, workoutId: number, input: SessionInput): number {
	getWorkout(ctx, workoutId); // ownership
	const inserted = db
		.insert(workoutSessions)
		.values({
			userId: ctx.userId,
			workoutId,
			doneOn: dayOf(ctx, input.doneOn),
			notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
			...stamps(ctx)
		})
		.returning({ id: workoutSessions.id })
		.get();

	writeMeasures(ctx, inserted.id, input.measures);
	touchLastDone(ctx, workoutId);
	return inserted.id;
}

export function getSession(ctx: Ctx, id: number): Session {
	const found = listSessions(ctx, { sessionId: id })[0];
	if (!found) throw new NotFoundError('session');
	return found;
}

/** Correct one: the day, the note, and every line, in one go. */
export function updateSession(ctx: Ctx, id: number, input: SessionInput): void {
	const existing = getSession(ctx, id);

	db.update(workoutSessions)
		.set({
			doneOn: dayOf(ctx, input.doneOn),
			notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
			updatedAt: stamp(ctx)
		})
		.where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, ctx.userId)))
		.run();

	if (input.measures !== undefined) writeMeasures(ctx, id, input.measures);
	touchLastDone(ctx, existing.workoutId);
}

/** For a session logged by accident. Its lines go with it. */
export function deleteSession(ctx: Ctx, id: number): void {
	const existing = getSession(ctx, id);
	db.delete(workoutSessions)
		.where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, ctx.userId)))
		.run();
	touchLastDone(ctx, existing.workoutId);
}

type SessionFilter = { workoutId?: number; sessionId?: number; since?: string };

function sessionWhere(ctx: Ctx, opts: SessionFilter) {
	const where = [eq(workoutSessions.userId, ctx.userId)];
	if (opts.workoutId !== undefined) where.push(eq(workoutSessions.workoutId, opts.workoutId));
	if (opts.sessionId !== undefined) where.push(eq(workoutSessions.id, opts.sessionId));
	if (opts.since !== undefined)
		where.push(
			sql`${workoutSessions.doneOn} >= ${str(opts.since, 'since', { max: 10, pattern: DAY_PATTERN })}`
		);
	return where;
}

/**
 * How many sessions match, ignoring any cap.
 *
 * A capped list that cannot say what it capped reads as a list that has
 * stopped being updated, so anything handing out a page of these hands out
 * this number beside it.
 */
export function countSessions(ctx: Ctx, opts: SessionFilter = {}): number {
	const row = db
		.select({ n: sql<number>`count(*)` })
		.from(workoutSessions)
		.where(and(...sessionWhere(ctx, opts)))
		.get();
	return row?.n ?? 0;
}

/**
 * Sessions, newest first, with their lines already attached.
 *
 * Two queries rather than one per session: the lines come back in a single
 * `IN` and are handed out by id, which is the shape the notebooks use for a
 * note's tags and people.
 */
export function listSessions(
	ctx: Ctx,
	opts: SessionFilter & { limit?: number; offset?: number } = {}
): Session[] {
	const where = sessionWhere(ctx, opts);

	let query = db
		.select({
			id: workoutSessions.id,
			workoutId: workoutSessions.workoutId,
			workoutTitle: workouts.title,
			doneOn: workoutSessions.doneOn,
			notes: workoutSessions.notes
		})
		.from(workoutSessions)
		.innerJoin(workouts, eq(workoutSessions.workoutId, workouts.id))
		.where(and(...where))
		.orderBy(desc(workoutSessions.doneOn), desc(workoutSessions.id))
		.$dynamic();

	if (opts.limit !== undefined) query = query.limit(opts.limit);
	// SQLite will not take an offset without a limit, so a bare offset gets the
	// largest one the engine accepts rather than being silently dropped.
	if (opts.offset) query = query.limit(opts.limit ?? -1).offset(opts.offset);
	const sessions = query.all();
	if (sessions.length === 0) return [];

	const lines = db
		.select({
			id: workoutMeasures.id,
			sessionId: workoutMeasures.sessionId,
			activity: workoutMeasures.activity,
			amount: workoutMeasures.amount,
			unit: workoutMeasures.unit
		})
		.from(workoutMeasures)
		.where(
			and(
				eq(workoutMeasures.userId, ctx.userId),
				inArray(
					workoutMeasures.sessionId,
					sessions.map((session) => session.id)
				)
			)
		)
		.orderBy(asc(workoutMeasures.sortOrder), asc(workoutMeasures.id))
		.all();

	const bySession = new Map<number, Measure[]>();
	for (const line of lines) {
		const held = bySession.get(line.sessionId) ?? [];
		held.push({ id: line.id, activity: line.activity, amount: line.amount, unit: line.unit });
		bySession.set(line.sessionId, held);
	}

	return sessions.map((session) => ({ ...session, measures: bySession.get(session.id) ?? [] }));
}

/**
 * One activity over time, ready to be drawn.
 *
 * Grouped by the person's own word for it rather than by workout: "ran" is
 * one line whether it happened in the morning session or on a Sunday, which
 * is what somebody asking "am I running more" means. Oldest first, because
 * that is the direction a chart's x-axis runs.
 */
export function measureHistory(
	ctx: Ctx,
	activity: string,
	opts: { since?: string } = {}
): { doneOn: string; amount: number | null; unit: string; workoutTitle: string }[] {
	const where = [
		eq(workoutMeasures.userId, ctx.userId),
		eq(workoutMeasures.activity, str(activity, 'activity', { max: MAX_ACTIVITY_LENGTH }))
	];
	if (opts.since !== undefined)
		where.push(
			sql`${workoutSessions.doneOn} >= ${str(opts.since, 'since', { max: 10, pattern: DAY_PATTERN })}`
		);

	return db
		.select({
			doneOn: workoutSessions.doneOn,
			amount: workoutMeasures.amount,
			unit: workoutMeasures.unit,
			workoutTitle: workouts.title
		})
		.from(workoutMeasures)
		.innerJoin(workoutSessions, eq(workoutMeasures.sessionId, workoutSessions.id))
		.innerJoin(workouts, eq(workoutSessions.workoutId, workouts.id))
		.where(and(...where))
		.orderBy(asc(workoutSessions.doneOn), asc(workoutSessions.id))
		.all();
}

/**
 * How much of one measure was done between two days, inclusive of the first
 * and exclusive of the last.
 *
 * What a goal counting a workout measure reads. A line with no amount — "went
 * for a swim", recorded without a number — contributes nothing rather than
 * breaking the sum, which is why the amounts are filtered rather than coerced.
 */
export function measureTotal(ctx: Ctx, activity: string, from: string, to: string): number {
	const row = db
		.select({ total: sql<number | null>`sum(${workoutMeasures.amount})` })
		.from(workoutMeasures)
		.innerJoin(workoutSessions, eq(workoutMeasures.sessionId, workoutSessions.id))
		.where(
			and(
				eq(workoutMeasures.userId, ctx.userId),
				eq(workoutMeasures.activity, str(activity, 'activity', { max: MAX_ACTIVITY_LENGTH })),
				sql`${workoutSessions.doneOn} >= ${str(from, 'from', { max: 10, pattern: DAY_PATTERN })}`,
				sql`${workoutSessions.doneOn} < ${str(to, 'to', { max: 10, pattern: DAY_PATTERN })}`
			)
		)
		.get();
	return row?.total ?? 0;
}

/** Everything this account has ever measured, for a picker or a chart's menu. */
export function measuredActivities(ctx: Ctx): { activity: string; unit: string; times: number }[] {
	return db
		.select({
			activity: workoutMeasures.activity,
			unit: workoutMeasures.unit,
			times: sql<number>`count(*)`
		})
		.from(workoutMeasures)
		.where(eq(workoutMeasures.userId, ctx.userId))
		.groupBy(workoutMeasures.activity, workoutMeasures.unit)
		.orderBy(desc(sql`count(*)`), asc(workoutMeasures.activity))
		.all();
}
