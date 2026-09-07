import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm';

import { db } from '../db/index.js';
import { diaryEntries, diaryEntryTags, tags } from '../db/schema.js';
import { getUserSetting, setUserSetting } from '../settings.js';
import {
	cleanupOrphanTags,
	ensureTagIds,
	linkDiaryTags,
	parseTags,
	replaceDiaryTags
} from '../tags.js';
import { localDateOf, type Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { assertEntryWithinLimit } from './media.js';
import { ownedNotebookId } from './notebooks.js';
import { stamp, stamps } from './time.js';
import { emit } from './webhooks.js';
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
 *
 * A note whose notebook was deleted keeps its notebook number, so it is
 * excluded too: it goes to the orphaned notes on the Notebooks page rather
 * than turning into a journal entry the day the renovation ends.
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
		.where(
			and(
				eq(diaryEntries.userId, ctx.userId),
				isNull(diaryEntries.notebookId),
				isNull(diaryEntries.notebookSeq)
			)
		)
		.orderBy(desc(diaryEntries.createdAt))
		.all();

	const byEntry = tagsForEntries(
		ctx,
		entries.map((e) => e.id)
	);
	return entries.map((entry) => ({ ...entry, tags: byEntry.get(entry.id) ?? [] }));
}

/**
 * The tags on each of these entries, keyed by entry id.
 *
 * One query for a page of notes rather than one per note: a notebook is a list
 * of forty, and the diary is longer than that.
 */
export function tagsForEntries(ctx: Ctx, entryIds: number[]): Map<number, Tag[]> {
	const byEntry = new Map<number, Tag[]>();
	if (entryIds.length === 0) return byEntry;

	const rows = db
		.select({ entryId: diaryEntryTags.entryId, id: tags.id, name: tags.name })
		.from(diaryEntryTags)
		.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
		.where(and(inArray(diaryEntryTags.entryId, entryIds), eq(tags.userId, ctx.userId)))
		.orderBy(tags.name)
		.all();

	for (const row of rows) {
		const list = byEntry.get(row.entryId) ?? [];
		list.push({ id: row.id, name: row.name });
		byEntry.set(row.entryId, list);
	}
	return byEntry;
}

export type Tag = { id: number; name: string };

export function listTags(ctx: Ctx) {
	return db.select().from(tags).where(eq(tags.userId, ctx.userId)).orderBy(tags.name).all();
}

export function createEntry(
	ctx: Ctx,
	raw: { content: unknown; tags?: unknown; notebookId?: unknown }
): number {
	const content = str(raw.content, 'content', { max: MAX_ENTRY_LENGTH });
	assertEntryWithinLimit(content);
	const entryId = insertEntry(ctx, content, undefined, ownedNotebookId(ctx, raw.notebookId));

	const tagNames = parseTags(tagInput(raw.tags));
	if (tagNames.length > 0) linkDiaryTags(entryId, ensureTagIds(tagNames, ctx.userId), ctx.userId);

	// The id and nothing else: a diary entry's content never leaves the app.
	emit(ctx, 'diary.created', { id: entryId });
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
	assertEntryWithinLimit(content);

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

/**
 * Two numbers, both counted at the moment of writing.
 *
 * `seq` is the account's own numbering — every piece of writing it holds, which
 * is what a `#12` reference means. `notebookSeq` is the notebook's, so the
 * fourth note about the kitchen is #4 rather than #36. Both are read and then
 * written, so the whole thing is one transaction: without it two writes landing
 * together would read the same highest number and the second would be rejected
 * by the unique index.
 */
/** Where the account's highest-ever entry number is remembered. */
const SEQ_MARK_KEY = 'diary.seq.highest';

function insertEntry(
	ctx: Ctx,
	content: string,
	forDate?: string,
	notebookId?: number | null
): number {
	return db.transaction((tx) => {
		// The high-water mark, not the highest number still present.
		//
		// `max(seq) + 1` gives a number back as soon as the newest entry is
		// deleted, and then a `#12` written in some other entry months ago
		// silently points at a different piece of writing. A reference that can
		// change what it refers to is not a reference.
		const present =
			tx
				.select({ value: max(diaryEntries.seq) })
				.from(diaryEntries)
				.where(eq(diaryEntries.userId, ctx.userId))
				.get()?.value ?? 0;
		const everUsed = Number(getUserSetting(ctx.userId, SEQ_MARK_KEY) ?? 0);
		const highest = Math.max(present, everUsed);
		setUserSetting(ctx.userId, SEQ_MARK_KEY, String(highest + 1));

		const highestInNotebook = notebookId
			? (tx
					.select({ value: max(diaryEntries.notebookSeq) })
					.from(diaryEntries)
					.where(eq(diaryEntries.notebookId, notebookId))
					.get()?.value ?? 0)
			: null;

		const result = tx
			.insert(diaryEntries)
			.values({
				...stamps(ctx),
				userId: ctx.userId,
				content,
				seq: highest + 1,
				notebookId: notebookId ?? null,
				notebookSeq: highestInNotebook === null ? null : highestInNotebook + 1,
				...(forDate ? { forDate } : {})
			})
			.run();

		return Number(result.lastInsertRowid);
	});
}

function tagInput(value: unknown): string {
	if (value === undefined || value === null) return '';
	const s = String(value).trim();
	if (s.length > MAX_TAGS_LENGTH)
		throw new ValidationError('That is more tags than one entry can carry');
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
		// The id breaks the tie. Two entries written in the same second — which
		// is a normal afternoon, not a rare race — otherwise made "the latest
		// one" whichever the database happened to return first.
		.orderBy(desc(diaryEntries.createdAt), desc(diaryEntries.id))
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
