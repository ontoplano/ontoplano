import { and, asc, eq, lt, notInArray } from 'drizzle-orm';

import { db } from '../db/index.js';
import { ideas, plannerTodos, shoppingItems } from '../db/schema.js';
import { CLOSED_STATUSES } from '../../task-status.js';
import type { Ctx } from './ctx.js';
import { stamp } from './time.js';

/**
 * Things that never ended.
 *
 * Todos, ideas and someday-items only ever accumulate. Nothing in the app has
 * ever asked "these nine are four months old — are they real?", so a list that
 * started as a plan becomes a monument, and eventually somebody stops opening
 * it rather than face it.
 *
 * This is deliberately part of the weekly review rather than a page of its own.
 * A second ritual is a second thing to remember, and the whole problem here is
 * that nobody remembers.
 */

/** Old enough to be worth a second look, and not so old that the list is huge. */
export const STALE_MONTHS = 3;

export type StaleThing = {
	sort: 'todo' | 'idea' | 'shopping';
	id: number;
	title: string;
	/** When it was last touched, as a date. */
	since: string;
};

function cutoff(ctx: Ctx, months: number): string {
	const d = new Date(ctx.now);
	d.setMonth(d.getMonth() - months);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function listStale(ctx: Ctx, months = STALE_MONTHS): StaleThing[] {
	const before = cutoff(ctx, months);
	const out: StaleThing[] = [];

	for (const row of db
		.select({ id: plannerTodos.id, title: plannerTodos.title, at: plannerTodos.updatedAt })
		.from(plannerTodos)
		.where(
			and(
				eq(plannerTodos.userId, ctx.userId),
				lt(plannerTodos.updatedAt, before),
				// Something you finished has ended. This is about the ones that did not.
				notInArray(plannerTodos.status, [...CLOSED_STATUSES])
			)
		)
		.orderBy(asc(plannerTodos.updatedAt))
		.all())
		out.push({ sort: 'todo', id: row.id, title: row.title, since: row.at.slice(0, 10) });

	for (const row of db
		.select({ id: ideas.id, content: ideas.content, at: ideas.updatedAt })
		.from(ideas)
		.where(
			and(eq(ideas.userId, ctx.userId), lt(ideas.updatedAt, before), eq(ideas.isApplied, false))
		)
		.orderBy(asc(ideas.updatedAt))
		.all())
		out.push({
			sort: 'idea',
			id: row.id,
			title: row.content.replace(/\s+/g, ' ').trim().slice(0, 90),
			since: row.at.slice(0, 10)
		});

	// Only the someday list. A staple you have not bought since May is a staple
	// you did not need, not a decision waiting to be made.
	for (const row of db
		.select({ id: shoppingItems.id, name: shoppingItems.name, at: shoppingItems.updatedAt })
		.from(shoppingItems)
		.where(
			and(
				eq(shoppingItems.userId, ctx.userId),
				lt(shoppingItems.updatedAt, before),
				eq(shoppingItems.type, 'someday'),
				eq(shoppingItems.bought, false)
			)
		)
		.orderBy(asc(shoppingItems.updatedAt))
		.all())
		out.push({ sort: 'shopping', id: row.id, title: row.name, since: row.at.slice(0, 10) });

	return out.sort((a, b) => a.since.localeCompare(b.since));
}

/**
 * "Still real."
 *
 * Touching the row is the whole action: it resets the clock, so the thing stops
 * being offered for another three months. Nothing else about it changes, which
 * is the point — you are answering a question, not editing anything.
 */
export function keepStale(ctx: Ctx, sort: StaleThing['sort'], id: number): boolean {
	const now = stamp(ctx);

	if (sort === 'todo')
		return (
			db
				.update(plannerTodos)
				.set({ updatedAt: now })
				.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
				.run().changes > 0
		);

	if (sort === 'idea')
		return (
			db
				.update(ideas)
				.set({ updatedAt: now })
				.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
				.run().changes > 0
		);

	return (
		db
			.update(shoppingItems)
			.set({ updatedAt: now })
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
			.run().changes > 0
	);
}

/**
 * "Let it go."
 *
 * Scoped to the account in the same statement, so an id belonging to somebody
 * else deletes nothing and reports nothing (I3).
 */
export function dropStale(ctx: Ctx, sort: StaleThing['sort'], id: number): boolean {
	if (sort === 'todo')
		return (
			db
				.delete(plannerTodos)
				.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, ctx.userId)))
				.run().changes > 0
		);

	if (sort === 'idea')
		return (
			db
				.delete(ideas)
				.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
				.run().changes > 0
		);

	return (
		db
			.delete(shoppingItems)
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.userId, ctx.userId)))
			.run().changes > 0
	);
}
