import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';

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
 * `/planner/history` has held these numbers since the beginning and nothing
 * ever asked anybody to look at them. That is the difference between a tracker
 * and a habit: the app records what happened and never once says "that was
 * your week, what do you want to do about it".
 *
 * A review is three questions. What did you plan against what you did. What
 * did not happen, and does it still need to. And three lines about the week,
 * which is the part that is actually worth reading in a year.
 */

export const LINES_PER_REVIEW = 3;
export const MAX_LINE_LENGTH = 500;

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

	const loose: Loose[] = instances
		.filter((i) => i.status !== 'done')
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

export function listLines(ctx: Ctx, weekStart: string) {
	return db
		.select({ position: weeklyReviews.position, content: weeklyReviews.content })
		.from(weeklyReviews)
		.where(and(eq(weeklyReviews.userId, ctx.userId), eq(weeklyReviews.weekStart, weekStart)))
		.all();
}

/**
 * Replace a week's three lines.
 *
 * Keyed by (week, position) like the daily wins, so re-saving edits the same
 * rows instead of accumulating a new review every time somebody fixes a typo,
 * and an emptied box removes its line rather than storing a blank.
 */
export function saveLines(ctx: Ctx, raw: { weekStart: unknown; contents: unknown[] }): void {
	const weekStart = weekStartOf(raw.weekStart, ctx.now);

	db.transaction((tx) => {
		for (let position = 1; position <= LINES_PER_REVIEW; position++) {
			const value = raw.contents[position - 1];
			const content = value === undefined || value === null ? '' : String(value).trim();

			const where = and(
				eq(weeklyReviews.userId, ctx.userId),
				eq(weeklyReviews.weekStart, weekStart),
				eq(weeklyReviews.position, position)
			);

			if (!content) {
				tx.delete(weeklyReviews).where(where).run();
				continue;
			}

			const text = str(content, `line ${position}`, { max: MAX_LINE_LENGTH });
			const existing = tx.select({ id: weeklyReviews.id }).from(weeklyReviews).where(where).get();

			if (existing) {
				tx.update(weeklyReviews)
					.set({ content: text, updatedAt: stamp(ctx) })
					.where(where)
					.run();
			} else {
				tx.insert(weeklyReviews)
					.values({ ...stamps(ctx), userId: ctx.userId, weekStart, position, content: text })
					.run();
			}
		}
	});
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
export function pastLines(
	ctx: Ctx,
	options: { limit?: number; before?: string } = {}
): { weekStart: string; lines: string[] }[] {
	const rows = db
		.select({
			weekStart: weeklyReviews.weekStart,
			position: weeklyReviews.position,
			content: weeklyReviews.content
		})
		.from(weeklyReviews)
		.where(
			and(
				eq(weeklyReviews.userId, ctx.userId),
				options.before ? lt(weeklyReviews.weekStart, options.before) : undefined
			)
		)
		.orderBy(desc(weeklyReviews.weekStart), asc(weeklyReviews.position))
		.all();

	const weeks: { weekStart: string; lines: string[] }[] = [];
	for (const row of rows) {
		const last = weeks[weeks.length - 1];
		if (last && last.weekStart === row.weekStart) last.lines.push(row.content);
		else weeks.push({ weekStart: row.weekStart, lines: [row.content] });
	}

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
export function carryIntoTodos(ctx: Ctx, weekStart: string, rawIds: unknown[]): number {
	const wanted = new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0));
	if (wanted.size === 0) return 0;

	const { loose } = readWeek(ctx, weekStart);
	const carrying = loose.filter((l) => wanted.has(l.id));

	for (const item of carrying) {
		createTodo(ctx, {
			title: item.title,
			notes: `Planned for ${item.date} and not done.`,
			categoryId: item.categoryId
		});
	}

	return carrying.length;
}

/**
 * Is last week still waiting to be looked at?
 *
 * The whole reason the review exists is that nothing ever asked. This is what
 * the dashboard asks with — and it only asks once the week is actually over
 * and there was something in it, because prompting somebody to review a week
 * they did not plan is how a prompt becomes noise you learn to ignore.
 */
export function reviewPending(ctx: Ctx): { weekStart: string; planned: number } | null {
	const lastMonday = dateString(addDays(getMonday(ctx.now), -7));

	if (listLines(ctx, lastMonday).length > 0) return null;

	const { reading } = readWeek(ctx, lastMonday);
	if (reading.planned === 0) return null;

	return { weekStart: lastMonday, planned: reading.planned };
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
