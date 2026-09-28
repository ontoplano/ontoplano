import { and, desc, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { ideaTags, ideas, tags } from '$lib/db/schema.js';
import {
	cleanupOrphanTags,
	ensureTagIds,
	linkIdeaTags,
	optionalTagInput,
	parseTags,
	replaceIdeaTags
} from './tags.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { notebookPatch } from './notebooks.js';
import { stamp, stamps } from './time.js';
import { host } from './host.js';
import { num, str } from './validate.js';
import { MAX_BATCH } from './todos.js';

/** Quick capture: a thought, optionally tagged, optionally marked as applied. */

export const MAX_IDEA_LENGTH = 4000;
export const MAX_NOTE_LENGTH = 2000;
// One ceiling for every room that takes tags; `tags.ts` owns it.
export { MAX_TAGS_LENGTH } from './tags.js';

export type IdeaTag = { id: number; name: string };

export type Idea = {
	id: number;
	content: string;
	isApplied: boolean;
	appliedNote: string | null;
	favorite: boolean;
	createdAt: string;
	updatedAt: string;
	notebookId: number | null;
	tags: IdeaTag[];
};

/**
 * The ideas, all of them or one subject's.
 *
 * `notebookId` narrows rather than changing the shape: a notebook's Ideas tab
 * is this room looking at one subject and draws the rows with the same
 * component, so it needs exactly what the room needs.
 */
export function listIdeas(ctx: Ctx, scope: { notebookId?: number } = {}): Idea[] {
	const rows = db
		.select({
			id: ideas.id,
			content: ideas.content,
			isApplied: ideas.isApplied,
			appliedNote: ideas.appliedNote,
			favorite: ideas.favorite,
			notebookId: ideas.notebookId,
			createdAt: ideas.createdAt,
			updatedAt: ideas.updatedAt
		})
		.from(ideas)
		.where(
			scope.notebookId === undefined
				? eq(ideas.userId, ctx.userId)
				: and(eq(ideas.userId, ctx.userId), eq(ideas.notebookId, scope.notebookId))
		)
		.orderBy(desc(ideas.createdAt))
		.all();

	return rows.map((idea) => ({
		...idea,
		tags: db
			.select({ id: tags.id, name: tags.name })
			.from(ideaTags)
			.innerJoin(tags, eq(ideaTags.tagId, tags.id))
			.where(and(eq(ideaTags.ideaId, idea.id), eq(tags.userId, ctx.userId)))
			.all()
	}));
}

export function listTags(ctx: Ctx): { id: number; userId: string; name: string }[] {
	return db.select().from(tags).where(eq(tags.userId, ctx.userId)).orderBy(tags.name).all();
}

export function createIdea(
	ctx: Ctx,
	raw: { content: unknown; tags?: unknown; notebookId?: unknown }
): number {
	const content = str(raw.content, 'content', { max: MAX_IDEA_LENGTH });
	const tagNames = parseTags(optionalTagInput(raw.tags));
	const now = stamp(ctx);

	const result = db
		.insert(ideas)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			content,
			...notebookPatch(ctx, raw, 'ideas'),
			createdAt: now,
			updatedAt: now
		})
		.run();
	const ideaId = Number(result.lastInsertRowid);

	if (tagNames.length > 0) linkIdeaTags(ideaId, ensureTagIds(tagNames, ctx.userId), ctx.userId);

	// An idea is its own one-line label, which is why it rides along where a
	// diary entry would send only its id.
	host.emit(ctx, 'idea.created', { id: ideaId, content });
	return ideaId;
}

export function updateIdea(
	ctx: Ctx,
	id: number,
	raw: { content: unknown; tags?: unknown; notebookId?: unknown }
): void {
	const content = str(raw.content, 'content', { max: MAX_IDEA_LENGTH });

	const res = db
		.update(ideas)
		.set({
			content,
			...notebookPatch(ctx, raw, 'ideas', { table: ideas, id }),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('idea');

	replaceIdeaTags(id, parseTags(optionalTagInput(raw.tags)), ctx.userId);
	cleanupOrphanTags(ctx.userId);
}

export function deleteIdea(ctx: Ctx, id: number): void {
	const res = db
		.delete(ideas)
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('idea');

	cleanupOrphanTags(ctx.userId);
}

/**
 * Applied is a toggle, so the current value is read inside the same scope.
 *
 * It deliberately leaves `updatedAt` alone. The card writes "· edited <date>"
 * whenever that differs from the creation date, so marking an idea applied
 * added a line of text to the row and reflowed everything under it — an edit
 * marker for something nobody edited.
 */
export function toggleApplied(ctx: Ctx, id: number, note: unknown): void {
	const existing = ownedIdea(ctx, id);
	const isApplied = !existing.isApplied;
	const appliedNote = isApplied ? optionalNote(note) : null;

	db.update(ideas)
		.set({ isApplied, appliedNote })
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();
}

/** The note beside an applied idea, which is not the idea. See `toggleApplied`. */
export function updateAppliedNote(ctx: Ctx, id: number, note: unknown): void {
	const existing = ownedIdea(ctx, id);
	if (!existing.isApplied) throw new ValidationError({ key: 'errors.ideas.ideaIsNotMarked' });

	db.update(ideas)
		.set({ appliedNote: optionalNote(note) })
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();
}

/** Starring an idea is not editing it either. See `toggleApplied`. */
export function toggleFavorite(ctx: Ctx, id: number): void {
	const existing = ownedIdea(ctx, id);

	db.update(ideas)
		.set({ favorite: !existing.favorite })
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();
}

function ownedIdea(ctx: Ctx, id: number) {
	const row = db
		.select({ id: ideas.id, isApplied: ideas.isApplied, favorite: ideas.favorite })
		.from(ideas)
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.get();

	if (!row) throw new NotFoundError('idea');
	return row;
}

function optionalNote(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	const s = String(value).trim();
	if (!s) return null;
	if (s.length > MAX_NOTE_LENGTH)
		throw new ValidationError(`The note has to be ${MAX_NOTE_LENGTH} characters or fewer`);
	return s;
}

/**
 * What can be done to several ideas at once: the row's own verbs with more
 * reach — star, mark applied, file, label, delete — never more capability.
 * Star and applied are set rather than toggled, so a mixed selection ends up
 * all one way.
 */
export const IDEA_BATCH_VERBS = ['favorite', 'apply', 'notebook', 'tag', 'remove'] as const;
export type IdeaBatchVerb = (typeof IDEA_BATCH_VERBS)[number];

export function isIdeaBatchVerb(value: unknown): value is IdeaBatchVerb {
	return typeof value === 'string' && (IDEA_BATCH_VERBS as readonly string[]).includes(value);
}

/** Add and take off labels, leaving the others where they are. */
function retagIdea(ctx: Ctx, id: number, change: { add?: unknown; remove?: unknown }): void {
	ownedIdea(ctx, id);
	const add = parseTags(optionalTagInput(change.add));
	const remove = new Set(parseTags(optionalTagInput(change.remove)));
	const now = db
		.select({ name: tags.name })
		.from(ideaTags)
		.innerJoin(tags, eq(ideaTags.tagId, tags.id))
		.where(and(eq(ideaTags.ideaId, id), eq(ideaTags.userId, ctx.userId)))
		.all()
		.map((one) => one.name);
	replaceIdeaTags(
		id,
		[...new Set([...now, ...add])].filter((name) => !remove.has(name)),
		ctx.userId
	);
}

/**
 * Do one thing to each of these ideas, or to none of them: an idea that is
 * not this account's refuses the whole press, as `batchEntries` does.
 */
export function batchIdeas(
	ctx: Ctx,
	verb: unknown,
	rawIds: unknown[],
	what: { add?: unknown; remove?: unknown; notebookId?: unknown } = {}
): number {
	if (!isIdeaBatchVerb(verb)) throw new ValidationError({ key: 'errors.diary.invalidBatch' });
	if (rawIds.length === 0) throw new ValidationError({ key: 'errors.diary.nothingWasChosen' });
	if (rawIds.length > MAX_BATCH)
		throw new ValidationError({ key: 'errors.diary.thatIsTooManyAtOnce' });
	const ids = [...new Set(rawIds.map((id) => num(id, 'id', { int: true, min: 1 })))];
	if (verb === 'notebook' && what.notebookId === undefined)
		throw new ValidationError({ key: 'errors.diary.invalidBatch' });

	db.transaction(() => {
		for (const id of ids) {
			if (verb === 'remove') {
				deleteIdea(ctx, id);
				continue;
			}
			if (verb === 'tag') {
				retagIdea(ctx, id, what);
				continue;
			}
			const patch =
				verb === 'favorite'
					? { favorite: true }
					: verb === 'apply'
						? { isApplied: true }
						: notebookPatch(ctx, { notebookId: what.notebookId }, 'ideas', { table: ideas, id });
			const res = db
				.update(ideas)
				.set(patch)
				.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
				.run();
			if (res.changes === 0) throw new NotFoundError('idea');
		}
		if (verb === 'tag') cleanupOrphanTags(ctx.userId);
	});
	return ids.length;
}
