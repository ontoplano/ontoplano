import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { quotes } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { created } from './time.js';
import { NotFoundError } from './errors.js';
import { optionalStr, str } from './validate.js';

/**
 * The quotes shown one-per-day on the dashboard.
 *
 * Small enough that it would be tempting to leave in the page, which is how
 * fourteen route files ended up owning their own queries. Ownership lives in
 * the `WHERE` here (I1), so a wrong id and someone else's id are the same 404.
 */

export const MAX_QUOTE_LENGTH = 500;
export const MAX_AUTHOR_LENGTH = 120;

export type Quote = { id: number; text: string; author: string | null };

export function listQuotes(ctx: Ctx): Quote[] {
	return db
		.select({ id: quotes.id, text: quotes.text, author: quotes.author })
		.from(quotes)
		.where(eq(quotes.userId, ctx.userId))
		.orderBy(quotes.id)
		.all();
}

export function createQuote(ctx: Ctx, raw: { text: unknown; author?: unknown }): Quote {
	const text = str(raw.text, 'quote', { max: MAX_QUOTE_LENGTH });
	const author = optionalStr(raw.author, 'author', { max: MAX_AUTHOR_LENGTH });

	return db
		.insert(quotes)
		.values({ ...created(ctx), ...created(ctx), userId: ctx.userId, text, author })
		.returning({ id: quotes.id, text: quotes.text, author: quotes.author })
		.get();
}

export function deleteQuote(ctx: Ctx, id: number): void {
	const res = db
		.delete(quotes)
		.where(and(eq(quotes.id, id), eq(quotes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('quote');
}
