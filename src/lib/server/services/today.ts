import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/index.js';
import { habitOccurrences, habits } from '../db/schema.js';
import { localDateOf, type Ctx } from './ctx.js';
import { listHabits, scheduledOn } from './habits.js';
import { getUpcomingSchedule } from './schedule.js';
import { listForDate } from './todos.js';

/**
 * One day, in one request.
 *
 * The home-screen widget draws blocks, habits and tasks together and refreshes
 * on a timer over mobile data, so it asks once rather than three times. Nothing
 * here is new: it is the three services the dashboard already uses, narrowed to
 * today and flattened into the shape a `RemoteViews` list can read without
 * thinking.
 */

export interface TodayBlock {
	id: string;
	start_time: string;
	duration_minutes: number;
	title: string;
	category: string | null;
	status: string;
}

export interface TodayHabit {
	id: number;
	name: string;
	type: string;
	streak: number;
	done: boolean;
}

export interface TodayTask {
	id: number;
	title: string;
	status: string;
	/** Set when the task was pulled onto an earlier day and never finished. */
	overdue: boolean;
}

export interface TodayBoard {
	date: string;
	timezone: string;
	blocks: TodayBlock[];
	/**
	 * Absent unless the caller was allowed to see them.
	 *
	 * Habits are the part of a day somebody is least likely to want on a lock
	 * screen, and they used to arrive with the plan whether or not that was
	 * asked for. Now they are their own grant, so a widget can show the day
	 * without a token that also reports which habits were kept.
	 */
	habits?: TodayHabit[];
	tasks: TodayTask[];
}

/** What a caller is allowed to see of a day. */
export interface TodayScope {
	/** Off by default: the caller has to hold `habits:read` to turn it on. */
	habits?: boolean;
}

export function getTodayBoard(ctx: Ctx, allowed: TodayScope = {}): TodayBoard {
	const date = localDateOf(ctx.now, ctx.tz);

	// Completed ones are included: a widget that hides what you have done all
	// morning reads as an empty day rather than a finished one.
	const schedule = getUpcomingSchedule(ctx, { days: 1, includeCompleted: true });

	const blocks = schedule.occurrences
		.filter((o) => o.local_date === date)
		.map((o) => ({
			id: o.id,
			start_time: o.start_time,
			duration_minutes: o.duration_minutes,
			title: o.title,
			category: o.category,
			status: o.status
		}));

	// Not read at all when they are not going out: a permission that stops the
	// data at the edge still put it through the database first.
	const all = allowed.habits ? listHabits(ctx) : [];
	const doneToday = new Set(
		all.length === 0
			? []
			: db
					.select({ habitId: habitOccurrences.habitId })
					.from(habitOccurrences)
					.innerJoin(habits, eq(habitOccurrences.habitId, habits.id))
					.where(
						and(
							eq(habits.userId, ctx.userId),
							eq(habitOccurrences.date, date),
							inArray(
								habitOccurrences.habitId,
								all.map((h) => h.id)
							)
						)
					)
					.all()
					.map((r) => r.habitId)
	);

	return {
		date,
		timezone: ctx.tz,
		blocks,
		// Only what is due today. A habit scheduled for weekdays is not a thing
		// you failed to do on Sunday.
		...(allowed.habits
			? {
					habits: all
						.filter((h) => scheduledOn(h, date))
						.map((h) => ({
							id: h.id,
							name: h.name,
							type: h.type,
							streak: h.streak,
							done: doneToday.has(h.id)
						}))
				}
			: {}),
		tasks: listForDate(ctx, date)
			.filter((t) => t.status !== 'done' && t.status !== 'skipped')
			.map((t) => ({
				id: t.id,
				title: t.title,
				status: t.status,
				overdue: t.scheduledDate !== null && t.scheduledDate < date
			}))
	};
}
