import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { goalLinks, goals } from '../db/schema.js';
import type { Ctx } from './ctx.js';

/**
 * Which goal a thing belongs to.
 *
 * Every relation in this app was one-directional in the interface: a goal
 * listed its tasks, and the task had no idea it was serving anything. That is
 * the difference between a set of sections and one app — you write a todo
 * because of a goal, and a week later the todo is the only thing you see.
 *
 * The links are few (one row per goal-to-thing edge, for one account), so this
 * fetches all of them in one query and the caller indexes what it needs rather
 * than asking per row. A list of forty todos would otherwise be forty queries
 * for something almost always empty.
 */

export type GoalBacklink = {
	id: number;
	title: string;
	/** Closed goals are still worth showing, quietly — they are why the thing exists. */
	status: 'open' | 'achieved' | 'missed' | 'abandoned';
};

export type GoalBacklinks = {
	todos: Record<number, GoalBacklink[]>;
	slots: Record<number, GoalBacklink[]>;
	activities: Record<number, GoalBacklink[]>;
};

export function goalBacklinks(ctx: Ctx): GoalBacklinks {
	const rows = db
		.select({
			goalId: goals.id,
			title: goals.title,
			status: goals.status,
			todoId: goalLinks.todoId,
			slotId: goalLinks.slotId,
			activityId: goalLinks.activityId
		})
		.from(goalLinks)
		.innerJoin(goals, eq(goalLinks.goalId, goals.id))
		.where(eq(goalLinks.userId, ctx.userId))
		.orderBy(goals.title)
		.all();

	const out: GoalBacklinks = { todos: {}, slots: {}, activities: {} };

	for (const row of rows) {
		const goal: GoalBacklink = { id: row.goalId, title: row.title, status: row.status };
		const [bucket, key] =
			row.todoId !== null
				? [out.todos, row.todoId]
				: row.slotId !== null
					? [out.slots, row.slotId]
					: [out.activities, row.activityId!];

		(bucket[key] ??= []).push(goal);
	}

	return out;
}
