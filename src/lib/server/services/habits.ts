import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import { db } from '../db/index.js';
import { habitOccurrences, habits } from '../db/schema.js';
import { localDateOf, type Ctx } from './ctx.js';
import { created } from './time.js';
import { ConflictError, NotFoundError } from './errors.js';
import { num, oneOf, optionalStr, str } from './validate.js';

/**
 * Habits are things to do or to avoid, logged one day at a time.
 *
 * `habit_occurrences` has no `user_id` of its own (R05 adds one), so every
 * statement here scopes by the habits the account owns rather than trusting an
 * occurrence id. It is still one statement — never a check followed by an
 * unscoped write.
 */

export const HABIT_TYPES = ['bad', 'good', 'neutral'] as const;
export type HabitType = (typeof HABIT_TYPES)[number];

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_NOTES_LENGTH = 1000;
export const HISTORY_DAYS = 365;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type HabitInput = {
	name: unknown;
	description?: unknown;
	type?: unknown;
	scheduledDays?: unknown;
};

export function listHabits(ctx: Ctx) {
	const rows = db
		.select({
			id: habits.id,
			name: habits.name,
			description: habits.description,
			type: habits.type,
			scheduledDays: habits.scheduledDays,
			createdAt: habits.createdAt
		})
		.from(habits)
		.where(eq(habits.userId, ctx.userId))
		.orderBy(habits.name)
		.all();

	const today = localDateOf(ctx.now, ctx.tz);
	const occurrences = listOccurrences(ctx);

	return rows.map((habit) => ({
		...habit,
		streak: computeStreak(
			habit,
			occurrences.filter((o) => o.habitId === habit.id),
			today
		)
	}));
}

/** A year of history, which is what the heatmap draws. */
export function listOccurrences(ctx: Ctx) {
	const cutoff = shiftDate(localDateOf(ctx.now, ctx.tz), -HISTORY_DAYS);

	return db
		.select({
			id: habitOccurrences.id,
			habitId: habitOccurrences.habitId,
			date: habitOccurrences.date,
			notes: habitOccurrences.notes
		})
		.from(habitOccurrences)
		.innerJoin(habits, eq(habitOccurrences.habitId, habits.id))
		.where(and(eq(habits.userId, ctx.userId), gte(habitOccurrences.date, cutoff)))
		.orderBy(desc(habitOccurrences.date))
		.all();
}

export function today(ctx: Ctx): string {
	return localDateOf(ctx.now, ctx.tz);
}

export function createHabit(ctx: Ctx, raw: HabitInput): number {
	const result = db
		.insert(habits)
		.values({ ...created(ctx), userId: ctx.userId, ...parseHabit(raw) })
		.run();
	return Number(result.lastInsertRowid);
}

export function updateHabit(ctx: Ctx, id: number, raw: HabitInput): void {
	const res = db
		.update(habits)
		.set(parseHabit(raw))
		.where(and(eq(habits.id, id), eq(habits.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('habit');
}

export function deleteHabit(ctx: Ctx, id: number): void {
	const res = db
		.delete(habits)
		.where(and(eq(habits.id, id), eq(habits.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('habit');
}

export function logOccurrence(
	ctx: Ctx,
	raw: { habitId: unknown; date?: unknown; notes?: unknown }
) {
	const habitId = ownedHabitId(ctx, raw.habitId);
	const date = parseDate(ctx, raw.date);
	const notes = optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH });

	if (occurrenceOn(habitId, date)) throw new ConflictError('Already logged for this date');

	db.insert(habitOccurrences)
		.values({ ...created(ctx), habitId, date, notes })
		.run();
}

/** Clicking a day in the heatmap: log it, or take it back. */
export function toggleOccurrence(ctx: Ctx, raw: { habitId: unknown; date: unknown }): void {
	const habitId = ownedHabitId(ctx, raw.habitId);
	const date = str(raw.date, 'date', { max: 10, pattern: DATE_PATTERN });
	const existing = occurrenceOn(habitId, date);

	if (existing) {
		db.delete(habitOccurrences).where(eq(habitOccurrences.id, existing.id)).run();
	} else {
		db.insert(habitOccurrences)
			.values({ ...created(ctx), habitId, date, notes: '' })
			.run();
	}
}

export function updateOccurrence(ctx: Ctx, id: number, notes: unknown): void {
	const res = db
		.update(habitOccurrences)
		.set({ notes: optionalStr(notes, 'notes', { max: MAX_NOTES_LENGTH }) })
		.where(and(eq(habitOccurrences.id, id), inArray(habitOccurrences.habitId, ownedHabitIds(ctx))))
		.run();

	if (res.changes === 0) throw new NotFoundError('occurrence');
}

export function deleteOccurrence(ctx: Ctx, id: number): void {
	const res = db
		.delete(habitOccurrences)
		.where(and(eq(habitOccurrences.id, id), inArray(habitOccurrences.habitId, ownedHabitIds(ctx))))
		.run();

	if (res.changes === 0) throw new NotFoundError('occurrence');
}

/**
 * How long the habit has been going.
 *
 * A bad habit counts the days since the last slip; a good or neutral one counts
 * consecutive scheduled days completed, walking backwards. Today missing does
 * not break a streak — the day is not over yet.
 */
export function computeStreak(
	habit: { type: string; createdAt: string; scheduledDays: string | null },
	occurrences: { date: string }[],
	todayDate: string
): number {
	const logged = [...occurrences].sort((a, b) => (a.date > b.date ? -1 : 1));

	if (habit.type === 'bad') {
		if (logged.length === 0) return daysBetween(habit.createdAt.slice(0, 10), todayDate);
		return daysBetween(logged[0].date, todayDate);
	}

	const scheduled = parseScheduledDays(habit.scheduledDays);
	const done = new Set(logged.map((o) => o.date));
	let streak = 0;

	for (let i = 0; i < HISTORY_DAYS; i++) {
		const date = shiftDate(todayDate, -i);
		if (scheduled.length > 0 && !scheduled.includes(weekdayOf(date))) continue;

		if (done.has(date)) streak++;
		else if (i > 0) break;
	}

	return streak;
}

export function parseScheduledDays(raw: string | null): number[] {
	if (!raw || raw.trim() === '') return [];
	return raw
		.split(',')
		.map((s) => parseInt(s.trim(), 10))
		.filter((n) => !isNaN(n) && n >= 0 && n <= 6);
}

function parseHabit(raw: HabitInput) {
	return {
		name: str(raw.name, 'name', { max: MAX_NAME_LENGTH }),
		description: optionalStr(raw.description, 'description', { max: MAX_DESCRIPTION_LENGTH }),
		type:
			raw.type === undefined || raw.type === null || raw.type === ''
				? ('bad' as HabitType)
				: oneOf(raw.type, 'type', HABIT_TYPES),
		scheduledDays: parseScheduledDays(
			raw.scheduledDays === undefined || raw.scheduledDays === null ? '' : String(raw.scheduledDays)
		).join(',')
	};
}

function ownedHabitId(ctx: Ctx, value: unknown): number {
	const id = num(value, 'habit', { int: true, min: 1 });
	const owned = db
		.select({ id: habits.id })
		.from(habits)
		.where(and(eq(habits.id, id), eq(habits.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('habit');
	return id;
}

function ownedHabitIds(ctx: Ctx): number[] {
	return db
		.select({ id: habits.id })
		.from(habits)
		.where(eq(habits.userId, ctx.userId))
		.all()
		.map((h) => h.id);
}

function occurrenceOn(habitId: number, date: string) {
	return db
		.select({ id: habitOccurrences.id })
		.from(habitOccurrences)
		.where(and(eq(habitOccurrences.habitId, habitId), eq(habitOccurrences.date, date)))
		.get();
}

/** A day the user named, or today where they are. Civil dates stay civil (I5). */
function parseDate(ctx: Ctx, value: unknown): string {
	const s = value === undefined || value === null ? '' : String(value).trim();
	if (!s) return localDateOf(ctx.now, ctx.tz);
	return str(s, 'date', { max: 10, pattern: DATE_PATTERN });
}

/** Calendar arithmetic on YYYY-MM-DD, done at noon so DST cannot shift the day. */
function shiftDate(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00`);
	d.setDate(d.getDate() + days);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(from: string, to: string): number {
	const a = new Date(`${from}T12:00:00`).getTime();
	const b = new Date(`${to}T12:00:00`).getTime();
	return Math.round((b - a) / 86400000);
}

/** Monday is 0 here, which is how `scheduled_days` is stored. */
/** Whether a habit is one of today's, for anything showing a single day. */
export function scheduledOn(habit: { scheduledDays: string | null }, date: string): boolean {
	const days = parseScheduledDays(habit.scheduledDays);
	// No days chosen means every day; that is what the habits page draws too.
	return days.length === 0 || days.includes(weekdayOf(date));
}

function weekdayOf(date: string): number {
	const dow = new Date(`${date}T12:00:00`).getDay();
	return dow === 0 ? 6 : dow - 1;
}
