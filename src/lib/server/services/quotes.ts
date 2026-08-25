import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { quotes } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { created } from './time.js';
import { NotFoundError, ValidationError } from './errors.js';
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
		.values({ ...created(ctx), userId: ctx.userId, text, author })
		.returning({ id: quotes.id, text: quotes.text, author: quotes.author })
		.get();
}

export type QuoteImport = { added: number; skipped: number };

/**
 * Many quotes at once.
 *
 * One per line, not CSV: half of all quotes contain a comma, so a comma-
 * separated file is a parsing argument waiting to happen. The author is
 * whatever follows the last em dash or double hyphen on the line, which is how
 * people already write them:
 *
 *   Plans are worthless, but planning is everything. — Eisenhower
 *   What gets measured gets managed -- Drucker
 *   A quote with no attribution at all
 *
 * Duplicates are skipped rather than refused: pasting the same list twice
 * should be boring, not an error.
 */
export function importQuotes(ctx: Ctx, raw: unknown): QuoteImport {
	const text = str(raw, 'quotes', { max: 50_000 });
	const lines = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length === 0) throw new ValidationError('Nothing to import');
	if (lines.length > 500) throw new ValidationError('That is more than 500 quotes');

	const existing = new Set(listQuotes(ctx).map((q) => q.text));
	let added = 0;
	let skipped = 0;

	db.transaction(() => {
		for (const line of lines) {
			const { text: quote, author } = splitAuthor(line);
			if (!quote || quote.length > MAX_QUOTE_LENGTH || existing.has(quote)) {
				skipped++;
				continue;
			}

			db.insert(quotes)
				.values({
					...created(ctx),
					userId: ctx.userId,
					text: quote,
					author: author.slice(0, MAX_AUTHOR_LENGTH)
				})
				.run();

			existing.add(quote);
			added++;
		}
	});

	return { added, skipped };
}

/** The author is what follows the last dash, when there is one. */
function splitAuthor(line: string): { text: string; author: string } {
	const match = line.match(/^(.*?)(?:\s+[—–]\s*|\s+--\s*)([^—–-]{1,120})$/);
	if (!match) return { text: stripQuotes(line), author: '' };
	return { text: stripQuotes(match[1].trim()), author: match[2].trim() };
}

/** People paste quotes with the quotation marks still on them. */
function stripQuotes(value: string): string {
	return value.replace(/^["“”'']+|["“”'']+$/g, '').trim();
}

export function deleteQuote(ctx: Ctx, id: number): void {
	const res = db
		.delete(quotes)
		.where(and(eq(quotes.id, id), eq(quotes.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('quote');
}
