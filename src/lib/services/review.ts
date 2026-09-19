import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';

import { blockName } from '../planner-grid.js';
import { db } from '$lib/db/index.js';
import { goals, goalTargets, weeklyReviews } from '$lib/db/schema.js';
import { addDays, startOfWeek } from './week-generator.js';
import { getWeekSettings } from './settings.js';
import type { Ctx } from './ctx.js';
import { generateOneOffs, listInstances, setInstanceStatus } from './instances.js';
import { createTodo } from './todos.js';
import { localDay, stamp, stamps } from './time.js';
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

/**
 * Which week a review is for.
 *
 * Snapped to the day this account's week begins on, so "the week of the 14th"
 * and "the week of the 16th" cannot become two reviews of the same seven days
 * — and so the review and the planner name the same seven. It used to snap to
 * Monday whatever the account had been told, which meant that for anybody
 * whose week starts on a Saturday, a Saturday block led one week on the plan
 * and closed the week before it in the review. `0085` re-keyed what was
 * already stored.
 */
export function weekStartOf(ctx: Ctx, value?: unknown, fallback: Date = ctx.now): string {
	const { firstDay } = getWeekSettings(ctx.userId);
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const parsed = new Date(value + 'T00:00:00');
		if (!isNaN(parsed.getTime())) return localDay(startOfWeek(parsed, firstDay));
	}
	return localDay(startOfWeek(fallback, firstDay));
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
		/** Minutes, because "where it went" is a question about time. */
		minutesPlanned: number;
		minutesDone: number;
	}[];
};

/**
 * A block that actually happened.
 *
 * The review could only ever say what did *not* — which is the half that needs
 * answering and not the half anybody wants to read at the end of a week. Same
 * shape as a loose one, minus the status, because there is only one.
 */
export type Done = {
	id: number;
	title: string;
	date: string;
	minutes: number;
	categoryName: string | null;
	categoryColor: string | null;
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

export function readWeek(
	ctx: Ctx,
	weekStart: string
): { reading: WeekReading; loose: Loose[]; done: Done[] } {
	const first = new Date(weekStart + 'T00:00:00');
	const after = addDays(first, 7);

	/*
	 * Make the week's one-offs exist before reading it.
	 *
	 * A block written for a day is a rule until somebody looks at that day,
	 * and then it becomes a record. The planner does that when you navigate
	 * to a week; the review never did — so a block written into a week that
	 * had already gone by was invisible there, and "Nothing was planned that
	 * week" is the app calling somebody a liar about a thing they did and
	 * wrote down afterwards, which is the ordinary case rather than a corner.
	 *
	 * One-offs only, deliberately. Running the recurring rules over a week
	 * long past invents a history nobody lived: a rule written this year would
	 * fill the review of an untouched week in 2020 with three blocks, and the
	 * "last week is still open" banner would then point at the oldest week the
	 * rules could reach. A one-off is the opposite — it is there because
	 * somebody wrote it on that day.
	 */
	generateOneOffs(ctx, first, after);
	const instances = listInstances(ctx, first, after);

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
			done: 0,
			minutesPlanned: 0,
			minutesDone: 0
		};
		bucket.planned += 1;
		bucket.minutesPlanned += i.durationMinutes;
		if (i.status === 'done') {
			bucket.done += 1;
			bucket.minutesDone += i.durationMinutes;
		}
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

	/** And what did happen, newest first: the week read back rather than audited. */
	const done: Done[] = instances
		.filter((i) => i.status === 'done')
		.map((i) => ({
			id: i.id,
			title: blockName(i),
			date: i.scheduledAt.slice(0, 10),
			minutes: i.durationMinutes,
			categoryName: i.categoryName,
			categoryColor: i.categoryColor
		}))
		.sort((a, b) => b.date.localeCompare(a.date));

	return {
		done,
		reading: {
			weekStart,
			weekEnd: localDay(addDays(first, 6)),
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
 * A goal's measures are single numbers with no history behind them, so this
 * cannot say *how much* one moved — only that the goal was touched inside the
 * week, which is the honest version and still answers "did any of this go
 * anywhere". Where it stands comes along, one line per measure.
 */
export function goalsTouched(ctx: Ctx, weekStart: string) {
	const first = new Date(weekStart + 'T00:00:00');
	const after = addDays(first, 7);

	const touched = db
		.select({
			id: goals.id,
			title: goals.title,
			status: goals.status
		})
		.from(goals)
		.where(
			and(
				eq(goals.userId, ctx.userId),
				gte(goals.updatedAt, weekStart),
				lt(goals.updatedAt, localDay(after))
			)
		)
		.orderBy(goals.title)
		.all();

	if (touched.length === 0) return [];

	const measures = db
		.select()
		.from(goalTargets)
		.where(
			and(
				eq(goalTargets.userId, ctx.userId),
				inArray(
					goalTargets.goalId,
					touched.map((g) => g.id)
				)
			)
		)
		.orderBy(goalTargets.sortOrder, goalTargets.id)
		.all();

	return touched.map((g) => ({
		...g,
		targets: measures
			.filter((t) => t.goalId === g.id)
			.map((t) => ({ currentValue: t.currentValue, targetValue: t.targetValue, unit: t.unit }))
	}));
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
	const weekStart = weekStartOf(ctx, raw.weekStart);
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

/** How far back the walk goes when it looks for a week still open. */
export const REVIEW_LOOKBACK_WEEKS = 12;

/**
 * How far back the open weeks go.
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
 *
 * ## What closes a week
 *
 * The blocks, not the note. It used to be the note: a week with an unanswered
 * Tuesday in it went quiet the moment you typed a sentence about it, and a week
 * where every block had been answered kept asking forever because nobody felt
 * like writing. Both halves of that were wrong, and the second is the one that
 * gets a prompt ignored — being told to fix something already fixed.
 *
 * So a week is open while a block on it is still waiting for an answer, and
 * every one of the four answers — it happened, skipped, onto the todo list, on
 * this day — takes a block out of that count. The note is writing, and writing
 * is not a chore anything here nags about.
 */
export function reviewPending(
	ctx: Ctx
): { weekStart: string; unanswered: number; weeks: number } | null {
	// This account's own first day, not Monday: the week being asked about has
	// to be the week the planner drew.
	const thisWeek = new Date(weekStartOf(ctx) + 'T00:00:00');
	let oldest: { weekStart: string; unanswered: number } | null = null;
	let weeks = 0;

	for (let back = 1; back <= REVIEW_LOOKBACK_WEEKS; back++) {
		const start = localDay(addDays(thisWeek, -7 * back));

		const { reading } = readWeek(ctx, start);
		// A week nobody planned is not a week anybody owes an answer for, and it
		// must not stop the walk either: a fortnight away leaves a gap in the
		// middle that says nothing about the weeks either side of it.
		if (reading.planned === 0) continue;
		// Every block answered is a week that is done with you, whether or not
		// anybody wrote about it.
		if (reading.unfinished === 0) continue;

		weeks++;
		oldest = { weekStart: start, unanswered: reading.unfinished };
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
