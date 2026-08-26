import { and, desc, eq, isNull, max } from 'drizzle-orm';

import { db } from '../db/index.js';
import { diaryEntries, diaryEntryTags, tags } from '../db/schema.js';
import {
	cleanupOrphanTags,
	ensureTagIds,
	linkDiaryTags,
	parseTags,
	replaceDiaryTags
} from '../tags.js';
import { localDateOf, type Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { ownedNotebookId } from './notebooks.js';
import { stamp, stamps } from './time.js';
import { str } from './validate.js';

/** The journal: free text, free-form tags, one running number per account. */

export const MAX_ENTRY_LENGTH = 20000;
export const MAX_WIN_LENGTH = 500;
export const MAX_TAGS_LENGTH = 500;

/** The tag that marks a three-wins entry, so they can be found again. */
export const WINS_TAG = '3w';

/**
 * The journal, and only the journal.
 *
 * A note written against a notebook is stored in this table — one kind of
 * writing, one place to keep it — but it is not a diary entry and does not
 * belong in the diary. It appears on its notebook and nowhere else.
 */
export function listEntries(ctx: Ctx) {
	const entries = db
		.select({
			id: diaryEntries.id,
			seq: diaryEntries.seq,
			content: diaryEntries.content,
			forDate: diaryEntries.forDate,
			createdAt: diaryEntries.createdAt,
			updatedAt: diaryEntries.updatedAt
		})
		.from(diaryEntries)
		.where(and(eq(diaryEntries.userId, ctx.userId), isNull(diaryEntries.notebookId)))
		.orderBy(desc(diaryEntries.createdAt))
		.all();

	return entries.map((entry) => ({
		...entry,
		tags: db
			.select({ id: tags.id, name: tags.name })
			.from(diaryEntryTags)
			.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
			.where(and(eq(diaryEntryTags.entryId, entry.id), eq(tags.userId, ctx.userId)))
			.all()
	}));
}

export function listTags(ctx: Ctx) {
	return db.select().from(tags).where(eq(tags.userId, ctx.userId)).orderBy(tags.name).all();
}

export function createEntry(
	ctx: Ctx,
	raw: { content: unknown; tags?: unknown; notebookId?: unknown }
): number {
	const content = str(raw.content, 'content', { max: MAX_ENTRY_LENGTH });
	const entryId = insertEntry(ctx, content, undefined, ownedNotebookId(ctx, raw.notebookId));

	const tagNames = parseTags(tagInput(raw.tags));
	if (tagNames.length > 0) linkDiaryTags(entryId, ensureTagIds(tagNames, ctx.userId), ctx.userId);

	return entryId;
}

/**
 * Three wins for a day, written as one entry and tagged so they can be found.
 *
 * The wins arrive as `win_0`, `win_1`, … from a form that can grow a row, so
 * the count is whatever was sent rather than a fixed three.
 */
export function createWins(
	ctx: Ctx,
	raw: { wins: unknown[]; tags?: unknown; forDate?: unknown; notebookId?: unknown }
): number {
	const wins = raw.wins
		.filter((w) => w !== undefined && w !== null)
		.map((w) => String(w).trim())
		.filter(Boolean)
		.map((w) => str(w, 'win', { max: MAX_WIN_LENGTH }));

	if (wins.length === 0) throw new ValidationError('At least one win is required');

	const forDate = civilDate(ctx, raw.forDate);
	const content = wins.map((w, i) => `Win ${i + 1}: ${w}`).join('\n');
	const entryId = insertEntry(ctx, content, forDate, ownedNotebookId(ctx, raw.notebookId));

	const userTags = parseTags(tagInput(raw.tags));
	const tagIds = ensureTagIds([WINS_TAG, ...userTags.filter((t) => t !== WINS_TAG)], ctx.userId);
	linkDiaryTags(entryId, tagIds, ctx.userId);

	return entryId;
}

export function updateEntry(
	ctx: Ctx,
	id: number,
	raw: { content: unknown; tags?: unknown; notebookId?: unknown }
): void {
	const content = str(raw.content, 'content', { max: MAX_ENTRY_LENGTH });

	const res = db
		.update(diaryEntries)
		.set({ content, notebookId: ownedNotebookId(ctx, raw.notebookId), updatedAt: stamp(ctx) })
		.where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('entry');

	replaceDiaryTags(id, parseTags(tagInput(raw.tags)), ctx.userId);
	cleanupOrphanTags(ctx.userId);
}

export function deleteEntry(ctx: Ctx, id: number): void {
	const res = db
		.delete(diaryEntries)
		.where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('entry');

	cleanupOrphanTags(ctx.userId);
}

/** `seq` is the account's own numbering, so it counts within the account. */
function insertEntry(
	ctx: Ctx,
	content: string,
	forDate?: string,
	notebookId?: number | null
): number {
	const highest =
		db
			.select({ value: max(diaryEntries.seq) })
			.from(diaryEntries)
			.where(eq(diaryEntries.userId, ctx.userId))
			.get()?.value ?? 0;

	const result = db
		.insert(diaryEntries)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			content,
			seq: highest + 1,
			notebookId: notebookId ?? null,
			...(forDate ? { forDate } : {})
		})
		.run();

	return Number(result.lastInsertRowid);
}

function tagInput(value: unknown): string {
	if (value === undefined || value === null) return '';
	const s = String(value).trim();
	if (s.length > MAX_TAGS_LENGTH) throw new ValidationError('too many tags');
	return s;
}

/** A day the user chose, or today where the user is. Never converted to UTC (I5). */
function civilDate(ctx: Ctx, value: unknown): string {
	const s = value === undefined || value === null ? '' : String(value).trim();
	if (!s) return localDateOf(ctx.now, ctx.tz);
	return str(s, 'date', { max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
}

/** The most recent entry, for the dashboard card. */
export function latestEntry(ctx: Ctx) {
	const entry = db
		.select({
			id: diaryEntries.id,
			content: diaryEntries.content,
			createdAt: diaryEntries.createdAt
		})
		.from(diaryEntries)
		.where(eq(diaryEntries.userId, ctx.userId))
		.orderBy(desc(diaryEntries.createdAt))
		.limit(1)
		.get();

	if (!entry) return null;

	return {
		...entry,
		tags: db
			.select({ id: tags.id, name: tags.name })
			.from(diaryEntryTags)
			.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
			.where(and(eq(diaryEntryTags.entryId, entry.id), eq(tags.userId, ctx.userId)))
			.all()
	};
}
