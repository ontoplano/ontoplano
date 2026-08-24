import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { ideaTags, ideas, tags } from '../db/schema.js';
import {
	cleanupOrphanTags,
	ensureTagIds,
	linkIdeaTags,
	parseTags,
	replaceIdeaTags
} from '../tags.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { stamp } from './time.js';
import { str } from './validate.js';

/** Quick capture: a thought, optionally tagged, optionally marked as applied. */

export const MAX_IDEA_LENGTH = 4000;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TAGS_LENGTH = 500;

export type IdeaTag = { id: number; name: string };

export type Idea = {
	id: number;
	content: string;
	isApplied: boolean;
	appliedNote: string | null;
	favorite: boolean;
	createdAt: string;
	updatedAt: string;
	tags: IdeaTag[];
};

export function listIdeas(ctx: Ctx): Idea[] {
	const rows = db
		.select({
			id: ideas.id,
			content: ideas.content,
			isApplied: ideas.isApplied,
			appliedNote: ideas.appliedNote,
			favorite: ideas.favorite,
			createdAt: ideas.createdAt,
			updatedAt: ideas.updatedAt
		})
		.from(ideas)
		.where(eq(ideas.userId, ctx.userId))
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

export function createIdea(ctx: Ctx, raw: { content: unknown; tags?: unknown }): number {
	const content = str(raw.content, 'content', { max: MAX_IDEA_LENGTH });
	const tagNames = parseTags(optionalTagInput(raw.tags));
	const now = stamp(ctx);

	const result = db
		.insert(ideas)
		.values({ userId: ctx.userId, content, createdAt: now, updatedAt: now })
		.run();
	const ideaId = Number(result.lastInsertRowid);

	if (tagNames.length > 0) linkIdeaTags(ideaId, ensureTagIds(tagNames, ctx.userId));

	return ideaId;
}

export function updateIdea(ctx: Ctx, id: number, raw: { content: unknown; tags?: unknown }): void {
	const content = str(raw.content, 'content', { max: MAX_IDEA_LENGTH });

	const res = db
		.update(ideas)
		.set({ content, updatedAt: stamp(ctx) })
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

/** Applied is a toggle, so the current value is read inside the same scope. */
export function toggleApplied(ctx: Ctx, id: number, note: unknown): void {
	const existing = ownedIdea(ctx, id);
	const isApplied = !existing.isApplied;
	const appliedNote = isApplied ? optionalNote(note) : null;

	db.update(ideas)
		.set({ isApplied, appliedNote, updatedAt: stamp(ctx) })
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();
}

export function updateAppliedNote(ctx: Ctx, id: number, note: unknown): void {
	const existing = ownedIdea(ctx, id);
	if (!existing.isApplied) throw new ValidationError('Idea is not marked as applied');

	db.update(ideas)
		.set({ appliedNote: optionalNote(note), updatedAt: stamp(ctx) })
		.where(and(eq(ideas.id, id), eq(ideas.userId, ctx.userId)))
		.run();
}

export function toggleFavorite(ctx: Ctx, id: number): void {
	const existing = ownedIdea(ctx, id);

	db.update(ideas)
		.set({ favorite: !existing.favorite, updatedAt: stamp(ctx) })
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

function optionalTagInput(value: unknown): string {
	if (value === undefined || value === null) return '';
	const s = String(value).trim();
	if (s.length > MAX_TAGS_LENGTH) throw new ValidationError('too many tags');
	return s;
}

function optionalNote(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	const s = String(value).trim();
	if (!s) return null;
	if (s.length > MAX_NOTE_LENGTH)
		throw new ValidationError(`note must be at most ${MAX_NOTE_LENGTH} characters`);
	return s;
}
