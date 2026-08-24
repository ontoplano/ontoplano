import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { dailyWins } from '../db/schema.js';
import { localDateOf, type Ctx } from './ctx.js';
import { str } from './validate.js';

/**
 * Three things that went well today.
 *
 * Stored as their own rows rather than as diary text so a streak or a monthly
 * tally is a query rather than a parse.
 */

export const WINS_PER_DAY = 3;
export const MAX_WIN_LENGTH = 500;

export function listWins(ctx: Ctx, date: string) {
	return db
		.select({ position: dailyWins.position, content: dailyWins.content })
		.from(dailyWins)
		.where(and(eq(dailyWins.userId, ctx.userId), eq(dailyWins.forDate, date)))
		.all();
}

/**
 * Replace a day's wins.
 *
 * Keyed by (date, position) so re-saving edits the same three rows instead of
 * accumulating duplicates, and an emptied box removes its win rather than
 * storing a blank.
 */
export function saveWins(ctx: Ctx, raw: { forDate?: unknown; contents: unknown[] }): void {
	const forDate = parseDate(ctx, raw.forDate);

	db.transaction((tx) => {
		for (let position = 1; position <= WINS_PER_DAY; position++) {
			const value = raw.contents[position - 1];
			const content = value === undefined || value === null ? '' : String(value).trim();

			tx.delete(dailyWins)
				.where(
					and(
						eq(dailyWins.userId, ctx.userId),
						eq(dailyWins.forDate, forDate),
						eq(dailyWins.position, position)
					)
				)
				.run();

			if (content)
				tx.insert(dailyWins)
					.values({
						userId: ctx.userId,
						forDate,
						position,
						content: str(content, 'win', { max: MAX_WIN_LENGTH })
					})
					.run();
		}
	});
}

function parseDate(ctx: Ctx, value: unknown): string {
	const s = value === undefined || value === null ? '' : String(value).trim();
	if (!s) return localDateOf(ctx.now, ctx.tz);
	return str(s, 'date', { max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
}
