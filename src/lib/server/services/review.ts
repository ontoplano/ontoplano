import { and, desc, eq, gte, lt } from 'drizzle-orm';

import { blockName } from '../../planner-grid.js';
import { db } from '../db/index.js';
import { goals, weeklyReviews } from '../db/schema.js';
import { addDays, getMonday } from '../week-generator.js';
import type { Ctx } from './ctx.js';
import { listInstances, setInstanceStatus } from './instances.js';
import { createTodo } from './todos.js';
import { stamp, stamps } from './time.js';
import { str } from './validate.js';

/**
 * Closing a week.
 *
 * The planner has recorded these numbers since the beginning and nothing
 * ever asked anybody to look at them. That is the difference between a tracker
 * and a habit: the app records what happened and never once says "that was
 * your week, what do you want to do about it".
 *
 * A review is three questions. What did you plan against what you did. What
 * did not happen, and does it still need to. And what you would say about the
 * week, which is the part that is actually worth reading in a year.
 */

/*
 * One note, not three lines.
 *
 * It used to be three boxes labelled "what went well", "what did not" and
 * "what you will do differently" — a form, in the place meant for the one part
 * of this that is writing. Somebody with two things to say had to invent a
 * third, and somebody with a paragraph had nowhere to put it. It is one field
 * with those three as a hint, stored where line one was, so every review ever
 * written is still there.
 */
export const NOTE_POSITION = 1;
export const MAX_NOTE_LENGTH = 8000;

function dateString(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Which week a review is for.
 *
 * Always snapped to its Monday, so "the week of the 14th" and "the week of the
 * 16th" cannot become two different reviews of the same seven days.
 */
export function weekStartOf(value: unknown, fallback: Date): string {
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const parsed = new Date(value + 'T00:00:00');
		if (!isNaN(parsed.getTime())) return dateString(getMonday(parsed));
	}
	return dateString(getMonday(fallback));
}

export type WeekReading = {
	weekStart: string;
	weekEnd: string;
	planned: number;
	done: number;
	skipped: number;
	unfinished: number;
	minutesPlanned: number;
	minutesDone: number;
	byCategory: {
		id: number | null;
		name: string;
		color: string | null;
		planned: number;
		done: number;
	}[];
};

/** An unfinished block, in the shape the review offers to carry it. */
export type Loose = {
	id: number;
	title: string;
	date: string;
	status: string;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
};

export function readWeek(ctx: Ctx, weekStart: string): { reading: WeekReading; loose: Loose[] } {
	const monday = new Date(weekStart + 'T00:00:00');
	const nextMonday = addDays(monday, 7);
	const instances = listInstances(ctx, monday, nextMonday);

	const buckets = new Map<string, WeekReading['byCategory'][number]>();
	let minutesPlanned = 0;
	let minutesDone = 0;

	for (const i of instances) {
		minutesPlanned += i.durationMinutes;
		if (i.status === 'done') minutesDone += i.durationMinutes;

		const key = String(i.categoryId ?? 'none');
		const bucket = buckets.get(key) ?? {
			id: i.categoryId,
			name: i.categoryName ?? 'No category',
			color: i.categoryColor,
			planned: 0,
			done: 0
		};
		bucket.planned += 1;
		if (i.status === 'done') bucket.done += 1;
		buckets.set(key, bucket);
	}

	/*
	 * What is still waiting for an answer — not merely "not done".
	 *
	 * This used to be everything that was not done, which put every skipped
	 * block back in the list every week: the Skipped button then set a block to
	 * what it already was, changed nothing, and left it sitting there. Skipping
	 * IS one of the three answers, so a block that carries it has been dealt
	 * with. The list is the open questions and nothing else, and each of the
	 * three buttons takes a row out of it for good.
	 */
	const loose: Loose[] = instances
		.filter((i) => i.status === 'todo' || i.status === 'doing')
		.map((i) => ({
			id: i.id,
			title: blockName(i),
			date: i.scheduledAt.slice(0, 10),
			status: i.status,
			categoryId: i.categoryId,
			categoryName: i.categoryName,
			categoryColor: i.categoryColor
		}));

	return {
		reading: {
			weekStart,
			weekEnd: dateString(addDays(monday, 6)),
			planned: instances.length,
			done: instances.filter((i) => i.status === 'done').length,
			skipped: instances.filter((i) => i.status === 'skipped').length,
			unfinished: loose.length,
			minutesPlanned,
			minutesDone,
			byCategory: [...buckets.values()].sort((a, b) => b.planned - a.planned)
		},
		loose
	};
}

/**
 * Goals you moved this week.
 *
 * A goal's value is a single number with no history behind it, so this cannot
 * say *how much* it moved — only that it was touched inside the week, which is
 * the honest version and still answers "did any of this go anywhere".
 */
export function goalsTouched(ctx: Ctx, weekStart: string) {
	const monday = new Date(weekStart + 'T00:00:00');
	const nextMonday = addDays(monday, 7);

	return db
		.select({
			id: goals.id,
			title: goals.title,
			status: goals.status,
			currentValue: goals.currentValue,
			targetValue: goals.targetValue,
			unit: goals.unit
		})
		.from(goals)
		.where(
			and(
				eq(goals.userId, ctx.userId),
				gte(goals.updatedAt, weekStart),
				lt(goals.updatedAt, dateString(nextMonday))
			)
		)
		.orderBy(goals.title)
		.all();
}

/**
 * Replace a week's note.
 *
 * Keyed by (week, position) like the daily wins, so re-saving edits the same
 * row instead of accumulating a new review every time somebody fixes a typo,
 * and an emptied box removes it rather than storing a blank. Position 1 is
 * where the first of the old three lines lived, and the migration folded the
 * other two into it, so nothing anybody wrote was lost.
 */
export function saveNote(ctx: Ctx, raw: { weekStart: unknown; content: unknown }): void {
	const weekStart = weekStartOf(raw.weekStart, ctx.now);
	const content =
		raw.content === undefined || raw.content === null ? '' : String(raw.content).trim();

	const where = and(
		eq(weeklyReviews.userId, ctx.userId),
		eq(weeklyReviews.weekStart, weekStart),
		eq(weeklyReviews.position, NOTE_POSITION)
	);

	db.transaction((tx) => {
		if (!content) {
			tx.delete(weeklyReviews).where(where).run();
			return;
		}

		const text = str(content, 'the note', { max: MAX_NOTE_LENGTH });
		const existing = tx.select({ id: weeklyReviews.id }).from(weeklyReviews).where(where).get();

		if (existing) {
			tx.update(weeklyReviews)
				.set({ content: text, updatedAt: stamp(ctx) })
				.where(where)
				.run();
		} else {
			tx.insert(weeklyReviews)
				.values({
					...stamps(ctx),
					userId: ctx.userId,
					weekStart,
					position: NOTE_POSITION,
					content: text
				})
				.run();
		}
	});
}

/** The week's note, or an empty string where there is not one yet. */
export function readNote(ctx: Ctx, weekStart: string): string {
	return (
		db
			.select({ content: weeklyReviews.content })
			.from(weeklyReviews)
			.where(
				and(
					eq(weeklyReviews.userId, ctx.userId),
					eq(weeklyReviews.weekStart, weekStart),
					eq(weeklyReviews.position, NOTE_POSITION)
				)
			)
			.get()?.content ?? ''
	);
}

/**
 * Everything ever written, newest week first.
 *
 * Three lines a week is the only running account of a year that this app keeps,
 * and until now they went into a row and stayed there: you could read last
 * week's by looking at last week, and everything before that by clicking back
 * fifty times. A thing you write and never see again is a thing you stop
 * writing.
 */
export function pastNotes(
	ctx: Ctx,
	options: { limit?: number; before?: string } = {}
): { weekStart: string; note: string }[] {
	const rows = db
		.select({ weekStart: weeklyReviews.weekStart, content: weeklyReviews.content })
		.from(weeklyReviews)
		.where(
			and(
				eq(weeklyReviews.userId, ctx.userId),
				eq(weeklyReviews.position, NOTE_POSITION),
				options.before ? lt(weeklyReviews.weekStart, options.before) : undefined
			)
		)
		.orderBy(desc(weeklyReviews.weekStart))
		.all();

	const weeks = rows.map((row) => ({ weekStart: row.weekStart, note: row.content }));
	return options.limit ? weeks.slice(0, options.limit) : weeks;
}

/**
 * Carry what did not happen into the todo list.
 *
 * A block that did not happen is a block that is gone: its occurrence belongs
 * to a day that has passed, and next week generates its own. So the honest
 * carry is not "move it" but "make a todo out of it" — something with no day
 * on it, which is exactly what a thing you still intend to do but did not
 * schedule *is*.
 *
 * The ids are checked against the week's own loose list rather than trusted,
 * which makes this ownership-safe by construction: an id from another account
 * is not in that list, so it is not carried and nothing says so (I3).
 */
export function carryIntoTodos(
	ctx: Ctx,
	weekStart: string,
	rawIds: unknown[],
	scheduledDate?: unknown
): number {
	const wanted = new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0));
	if (wanted.size === 0) return 0;

	const { loose } = readWeek(ctx, weekStart);
	const carrying = loose.filter((l) => wanted.has(l.id));

	/*
	 * The block is answered for as well as copied.
	 *
	 * Without the second half, carrying left the block in the list — so
	 * pressing the button twice made two todos out of one block, which is the
	 * one outcome a review must not produce. Reading `loose` again is what makes
	 * it safe: the second press finds nothing to carry.
	 *
	 * Skipped is the honest status for what is left behind. The block did not
	 * happen, and next week generates its own; what still needs doing is now a
	 * todo with no day on it, which is the whole point of carrying.
	 */
	for (const item of carrying) {
		createTodo(ctx, {
			title: item.title,
			notes: `Planned for ${item.date} and not done.`,
			categoryId: item.categoryId,
			// Given a day, it is a todo with a date on it rather than one more
			// thing on an undated pile — which is the difference between putting
			// something off and deciding when to do it.
			...(scheduledDate ? { scheduledDate } : {})
		});
		setInstanceStatus(ctx, item.id, 'skipped');
	}

	return carrying.length;
}

/**
 * How far back the unwritten weeks go.
 *
 * The whole reason the review exists is that nothing ever asked. This is what
 * the dashboard asks with — and it only asks about a week that is actually
 * over and had something in it, because prompting somebody to review a week
 * they did not plan is how a prompt becomes noise you learn to ignore.
 *
 * It used to look at last week and stop, so somebody who let three go by was
 * told the same thing as somebody who let one — "last week is still open" —
 * which is both wrong and comforting. It walks back now and reports the oldest
 * one and how many there are, because the oldest is where you would start and
 * the number is the thing worth knowing.
 */
export const REVIEW_LOOKBACK_WEEKS = 12;

export function reviewPending(
	ctx: Ctx
): { weekStart: string; planned: number; weeks: number } | null {
	const lastMonday = getMonday(ctx.now);
	let oldest: { weekStart: string; planned: number } | null = null;
	let weeks = 0;

	for (let back = 1; back <= REVIEW_LOOKBACK_WEEKS; back++) {
		const monday = dateString(addDays(lastMonday, -7 * back));
		if (readNote(ctx, monday)) continue;

		const { reading } = readWeek(ctx, monday);
		// A week nobody planned is not a week anybody owes a write-up for, and it
		// must not stop the walk either: a fortnight away leaves a gap in the
		// middle that says nothing about the weeks either side of it.
		if (reading.planned === 0) continue;

		weeks++;
		oldest = { weekStart: monday, planned: reading.planned };
	}

	return oldest ? { ...oldest, weeks } : null;
}

/**
 * Say what actually happened to the ones that did not.
 *
 * Carrying into the todo list was the only answer on offer, and it is the least
 * common one. Most of what is sitting in that list on a Sunday either happened
 * and was never ticked, or was never going to happen and you have made your
 * peace with it. Offering only "carry it" made the review a chore with one
 * wrong answer.
 *
 * Ids are checked against the week's own loose list rather than trusted, which
 * makes this ownership-safe by construction: an id from another account is not
 * in that list, so nothing happens and nothing says so (I3).
 */
export function resolveLoose(
	ctx: Ctx,
	weekStart: string,
	rawIds: unknown[],
	status: 'done' | 'skipped'
): number {
	const wanted = new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0));
	if (wanted.size === 0) return 0;

	const { loose } = readWeek(ctx, weekStart);
	const mine = loose.filter((l) => wanted.has(l.id));

	for (const item of mine) setInstanceStatus(ctx, item.id, status);

	return mine.length;
}

/**
 * Settle a week in one go.
 *
 * The review used to ask for one answer at a time, so closing a week of twenty
 * blocks was twenty round trips and twenty chances to lose your place. You
 * mark them up on the page — done, skipped, onto the todo list, on this day —
 * and this applies the lot when you press save.
 *
 * Every id is checked against the week's own loose list rather than trusted,
 * which makes it ownership-safe by construction: an id from another account is
 * not in that list, so nothing happens to it and nothing says so.
 */
export type Verdict = { id: number; verb: 'done' | 'skipped' | 'todo'; date?: string };

export function settleWeek(ctx: Ctx, weekStart: string, verdicts: Verdict[]): number {
	if (verdicts.length === 0) return 0;

	const { loose } = readWeek(ctx, weekStart);
	const byId = new Map(loose.map((l) => [l.id, l]));
	let settled = 0;

	for (const verdict of verdicts) {
		const item = byId.get(verdict.id);
		if (!item) continue;

		if (verdict.verb === 'todo') {
			createTodo(ctx, {
				title: item.title,
				notes: `Planned for ${item.date} and not done.`,
				categoryId: item.categoryId,
				...(verdict.date ? { scheduledDate: verdict.date } : {})
			});
			// Skipped is the honest status for what is left behind: the block did
			// not happen, and what still needs doing is now a todo.
			setInstanceStatus(ctx, item.id, 'skipped');
		} else {
			setInstanceStatus(ctx, item.id, verdict.verb);
		}

		settled++;
	}

	return settled;
}
