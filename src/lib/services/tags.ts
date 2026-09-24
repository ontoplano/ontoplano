import { db } from '$lib/db/index.js';
import {
	tags,
	diaryEntries,
	diaryEntryTags,
	exceptionalTasks,
	exceptionalTaskTags,
	ideas,
	ideaTags,
	mediaTags,
	notebooks,
	recurringTaskTags,
	todoTags,
	todoTasks
} from '$lib/db/schema';
import { eq, and, count, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError } from './errors.js';
import { optionalStr, str } from './validate.js';

/**
 * Tags, and the rows that join them to what they tag.
 *
 * Every statement here carries the account in its own `WHERE` (I1). The join
 * tables used to have no `user_id` at all, so "delete this entry's tags" was a
 * statement scoped by an id that arrived from a form — correct only for as long
 * as the caller remembered to check first.
 */

/** As much tag as any one thing may carry, in characters of raw input. */
export const MAX_TAGS_LENGTH = 500;

/**
 * Tag input as it arrives from a form or a tool, checked and nothing else.
 *
 * Shared rather than written per room: ideas had a private copy of this, and
 * the moment todos wanted tags too there would have been two ceilings that
 * could drift apart.
 */
export function optionalTagInput(value: unknown): string {
	if (value === undefined || value === null) return '';
	const given = String(value).trim();
	if (given.length > MAX_TAGS_LENGTH)
		throw new ValidationError({ key: 'errors.tags.thatIsMoreTagsThan' });
	return given;
}

/**
 * Normalizes raw tag input. Strips leading #, splits on commas/spaces, lowercases, dedupes.
 * All these produce ["tagfoo", "tagbar"]:
 *   "tagfoo, tagbar" | "tagfoo tagbar" | "#tagfoo #tagbar" | "#tagfoo, #tagbar"
 */
export function parseTags(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[,\s]+/)
				.map((t) => t.replace(/^#+/, '').trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

export function ensureTagIds(tagNames: string[], userId: string): number[] {
	return tagNames.map((name) => {
		const existing = db
			.select({ id: tags.id })
			.from(tags)
			.where(and(eq(tags.name, name), eq(tags.userId, userId)))
			.get();
		if (existing) return existing.id;
		const result = db.insert(tags).values({ userId, name }).run();
		return Number(result.lastInsertRowid);
	});
}

export function linkDiaryTags(entryId: number, tagIds: number[], userId: string): void {
	const now = new Date().toISOString();
	for (const tagId of tagIds) {
		db.insert(diaryEntryTags).values({ userId, entryId, tagId, taggedAt: now }).run();
	}
}

/**
 * Set a note's labels to exactly these, without forgetting when the old ones
 * went on.
 *
 * The same diff `replaceTodoTags` does, and for the same reason: deleting
 * every row and writing them back gives the same answer and a different
 * history, so a label that had been there a week came back dated today and
 * "what went into review since I last looked" became "what has been edited
 * since".
 */
export function replaceDiaryTags(entryId: number, tagNames: string[], userId: string): void {
	const wanted = new Set(tagNames.length > 0 ? ensureTagIds(tagNames, userId) : []);

	const have = db
		.select({ id: diaryEntryTags.id, tagId: diaryEntryTags.tagId })
		.from(diaryEntryTags)
		.where(and(eq(diaryEntryTags.entryId, entryId), eq(diaryEntryTags.userId, userId)))
		.all();

	const dropping = have.filter((row) => !wanted.has(row.tagId)).map((row) => row.id);
	if (dropping.length > 0) {
		db.delete(diaryEntryTags).where(inArray(diaryEntryTags.id, dropping)).run();
	}

	const already = new Set(have.map((row) => row.tagId));
	const adding = [...wanted].filter((tagId) => !already.has(tagId));
	if (adding.length > 0) linkDiaryTags(entryId, adding, userId);
}

/**
 * Drop the labels nothing carries any more.
 *
 * Read from `CARRIERS` rather than from four hand-written queries: the four
 * were diary, ideas, media and todos, so a word used only on a block of the
 * week counted as referenced by nobody and was deleted the next time an
 * unrelated note was edited. Now a join table cannot be left out of this
 * without being left out of every other verb here too.
 */
export function cleanupOrphanTags(userId: string): void {
	const referencedIds = [
		...new Set(
			CARRIERS.flatMap((carrier) =>
				db
					.select({ tagId: carrier.table.tagId })
					.from(carrier.table)
					.innerJoin(tags, eq(carrier.table.tagId, tags.id))
					.where(eq(tags.userId, userId))
					.all()
					.map((row) => row.tagId)
			)
		)
	];

	if (referencedIds.length === 0) {
		db.delete(tags).where(eq(tags.userId, userId)).run();
	} else {
		db.delete(tags)
			.where(and(eq(tags.userId, userId), notInArray(tags.id, referencedIds)))
			.run();
	}
}

export function linkIdeaTags(ideaId: number, tagIds: number[], userId: string): void {
	for (const tagId of tagIds) {
		db.insert(ideaTags).values({ userId, ideaId, tagId }).run();
	}
}

export function replaceIdeaTags(ideaId: number, tagNames: string[], userId: string): void {
	db.delete(ideaTags)
		.where(and(eq(ideaTags.ideaId, ideaId), eq(ideaTags.userId, userId)))
		.run();

	if (tagNames.length > 0) {
		linkIdeaTags(ideaId, ensureTagIds(tagNames, userId), userId);
	}
}

/**
 * The same three verbs for a block, recurring or one-off.
 *
 * A label belonged to the dateless task only, which made it a property of one
 * shape of task rather than of a task: "everything about the move" could not
 * include the three hours booked for it. The vocabulary is the one `tags`
 * table either way — a word used on a task is the same word on a block.
 */
function blockJoin(kind: BlockKind) {
	return kind === 'recurring' ? recurringTaskTags : exceptionalTaskTags;
}

export type BlockKind = 'recurring' | 'exceptional';

/** A label and when it went on. The same shape a task's labels have. */
export type Tag = { id: number; name: string; taggedAt: string | null };

export function tagsForBlock(kind: BlockKind, taskId: number, userId: string): Tag[] {
	const join = blockJoin(kind);
	return db
		.select({ id: tags.id, name: tags.name, taggedAt: join.taggedAt })
		.from(join)
		.innerJoin(tags, eq(join.tagId, tags.id))
		.where(and(eq(join.taskId, taskId), eq(join.userId, userId)))
		.orderBy(tags.name)
		.all();
}

/** Set a block's labels to exactly these, keeping the dates of the survivors. */
export function replaceBlockTags(
	kind: BlockKind,
	taskId: number,
	tagNames: string[],
	userId: string
): void {
	const join = blockJoin(kind);
	const wanted = new Set(tagNames.length > 0 ? ensureTagIds(tagNames, userId) : []);

	const have = db
		.select({ id: join.id, tagId: join.tagId })
		.from(join)
		.where(and(eq(join.taskId, taskId), eq(join.userId, userId)))
		.all();

	const dropping = have.filter((row) => !wanted.has(row.tagId)).map((row) => row.id);
	if (dropping.length > 0) db.delete(join).where(inArray(join.id, dropping)).run();

	const already = new Set(have.map((row) => row.tagId));
	const now = new Date().toISOString();
	for (const tagId of wanted) {
		if (already.has(tagId)) continue;
		db.insert(join).values({ userId, taskId, tagId, taggedAt: now }).run();
	}
}

export function linkTodoTags(todoId: number, tagIds: number[], userId: string): void {
	const now = new Date().toISOString();
	for (const tagId of tagIds) {
		db.insert(todoTags).values({ userId, todoId, tagId, taggedAt: now }).run();
	}
}

/**
 * Set the labels to exactly these, without forgetting when the old ones went on.
 *
 * This used to delete every row and write them all back, which is the same
 * answer and a different history: a label that had been there a week came back
 * dated today, so "what was tagged since I last looked" was whatever had been
 * edited since. Now only the difference moves — the ones going away are
 * dropped, the new ones are dated, and a label that was already there is left
 * exactly as it was.
 */
export function replaceTodoTags(todoId: number, tagNames: string[], userId: string): void {
	const wanted = new Set(tagNames.length > 0 ? ensureTagIds(tagNames, userId) : []);

	const have = db
		.select({ id: todoTags.id, tagId: todoTags.tagId })
		.from(todoTags)
		.where(and(eq(todoTags.todoId, todoId), eq(todoTags.userId, userId)))
		.all();

	const dropping = have.filter((row) => !wanted.has(row.tagId)).map((row) => row.id);
	if (dropping.length > 0) {
		db.delete(todoTags).where(inArray(todoTags.id, dropping)).run();
	}

	const already = new Set(have.map((row) => row.tagId));
	const adding = [...wanted].filter((tagId) => !already.has(tagId));
	if (adding.length > 0) linkTodoTags(todoId, adding, userId);
}

export function linkMediaTags(mediaId: number, tagIds: number[], userId: string): void {
	for (const tagId of tagIds) {
		db.insert(mediaTags).values({ userId, mediaId, tagId }).run();
	}
}

export function replaceMediaTags(mediaId: number, tagNames: string[], userId: string): void {
	db.delete(mediaTags)
		.where(and(eq(mediaTags.mediaId, mediaId), eq(mediaTags.userId, userId)))
		.run();

	if (tagNames.length > 0) {
		linkMediaTags(mediaId, ensureTagIds(tagNames, userId), userId);
	}
}

/**
 * The account's one vocabulary, as a thing you can manage.
 *
 * A tag used to come into being by being typed into a box and never leave:
 * no rename, no colour, no way off. These are the verbs for the Tags tab in
 * the Notebooks room — the same word is on a task, a note, an idea, a block
 * and a picture, so every one of them is account-wide by definition.
 */

/** As long as one label may be. Longer than anybody types, short enough to index. */
export const MAX_TAG_NAME_LENGTH = 60;

/** What `<input type="color">` produces, and nothing else. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Every table that joins a tag to something that carries it.
 *
 * Written down once, because the verbs below all have to visit every one of
 * them: a rename that merges, a delete that detaches, a count that says how
 * much a word is doing. A seventh join table added without a line here is a
 * room where labels quietly stop being managed, and nothing would fail.
 *
 * `owner` is what the row is *on* — the note, the task, the picture — which
 * is what a merge needs to notice that one thing carries both labels.
 */
const CARRIERS = [
	{ table: diaryEntryTags, owner: diaryEntryTags.entryId, taggedAt: diaryEntryTags.taggedAt },
	{
		table: exceptionalTaskTags,
		owner: exceptionalTaskTags.taskId,
		taggedAt: exceptionalTaskTags.taggedAt
	},
	{ table: ideaTags, owner: ideaTags.ideaId, taggedAt: null },
	{ table: mediaTags, owner: mediaTags.mediaId, taggedAt: null },
	{
		table: recurringTaskTags,
		owner: recurringTaskTags.taskId,
		taggedAt: recurringTaskTags.taggedAt
	},
	{ table: todoTags, owner: todoTags.todoId, taggedAt: todoTags.taggedAt }
];

/** A label as the Tags screen reads it: what it is, its colour, and how much work it is doing. */
export type TagSummary = {
	id: number;
	name: string;
	color: string | null;
	description: string;
	uses: number;
};

/** The label as it is stored. */
export type TagRow = { id: number; name: string; color: string | null; description: string };

/**
 * How long a label's meaning may be.
 *
 * A sentence, not a note: what `#short` means here is one line, and anything
 * longer is a note that should be in a notebook.
 */
export const MAX_TAG_DESCRIPTION_LENGTH = 200;

/**
 * What a tag counts towards, in the order a notebook's own tabs run.
 *
 * `pictures` never appears inside a notebook — a picture belongs to the
 * gallery — so it is last, where the whole account is being counted.
 */
export type TagUseKind = 'notes' | 'tasks' | 'ideas' | 'pictures';
const USE_ORDER: readonly TagUseKind[] = ['notes', 'tasks', 'ideas', 'pictures'];

/** A label inside one notebook: what it is, and what carries it in there. */
export type NotebookTag = TagRow & {
	uses: number;
	/** One entry per kind that has any, in `USE_ORDER`. */
	by: { kind: TagUseKind; count: number }[];
};

/** One name, normalised the way `TagInput` normalises what is typed into it. */
function tagName(raw: unknown): string {
	const words = parseTags(str(raw, 'name', { max: MAX_TAG_NAME_LENGTH }));
	if (words.length === 0) throw new ValidationError({ key: 'errors.tags.aTagNeedsAName' });
	// Commas and spaces are what separates two tags everywhere else in the app,
	// so a rename to "urgent work" is two labels asking to be one.
	if (words.length > 1) throw new ValidationError({ key: 'errors.tags.aTagIsOneWord' });
	return words[0];
}

/** `#rrggbb`, or null for the ones nobody has chosen a colour for. */
function tagColor(raw: unknown): string | null {
	if (raw === undefined || raw === null || raw === '') return null;
	return str(raw, 'colour', { max: 7, pattern: HEX_COLOR }).toLowerCase();
}

function tagOf(id: number, userId: string): TagRow {
	const found = db
		.select({
			id: tags.id,
			name: tags.name,
			color: tags.color,
			description: tags.description
		})
		.from(tags)
		.where(and(eq(tags.id, id), eq(tags.userId, userId)))
		.get();
	// A stranger's id answers exactly as an id that was never there (I1).
	if (!found) throw new NotFoundError('tag');
	return found;
}

/** Every label the account has, alphabetically, with how many things carry each. */
export function listTagsWithUses(userId: string): TagSummary[] {
	const uses = new Map<number, number>();
	for (const carrier of CARRIERS) {
		const rows = db
			.select({ tagId: carrier.table.tagId, n: count() })
			.from(carrier.table)
			.where(eq(carrier.table.userId, userId))
			.groupBy(carrier.table.tagId)
			.all();
		for (const row of rows) uses.set(row.tagId, (uses.get(row.tagId) ?? 0) + Number(row.n));
	}

	return db
		.select({
			id: tags.id,
			name: tags.name,
			color: tags.color,
			description: tags.description
		})
		.from(tags)
		.where(eq(tags.userId, userId))
		.orderBy(tags.name)
		.all()
		.map((tag) => ({ ...tag, uses: uses.get(tag.id) ?? 0 }));
}

/**
 * Give a label a colour, or take its colour away.
 *
 * Null is a real answer and not a missing one: most labels are words rather
 * than colours, and a tag with no colour is drawn as the plain chip it has
 * always been.
 */
export function recolorTag(userId: string, id: number, color: unknown): TagRow {
	const tag = tagOf(id, userId);
	const chosen = tagColor(color);
	db.update(tags).set({ color: chosen }).where(eq(tags.id, tag.id)).run();
	return { ...tag, color: chosen };
}

/**
 * Rename a label — and if the new name is one the account already uses, merge
 * into it rather than refusing.
 *
 * The unique index on (account, name) is what makes the vocabulary one
 * vocabulary, and hitting it is exactly what somebody fixing a typo does:
 * `worik` should become `work`, and `work` already exists. Refusing leaves
 * two words meaning one thing, which is the state they were trying to get
 * out of.
 *
 * Merging means: everything that carried the old label now carries the
 * surviving one, and the old label stops existing. For a thing that carried
 * *both* there is nothing to move — it is already labelled — so that join row
 * goes, and the one that stays takes the earlier of the two dates, because
 * that is when the thing actually started carrying this idea. The survivor
 * keeps its own colour unless it never had one, in which case it inherits the
 * colour of the label that is being folded into it: a colour that was chosen
 * beats no choice at all.
 */
export function renameTag(userId: string, id: number, name: unknown): TagRow {
	const tag = tagOf(id, userId);
	const wanted = tagName(name);
	if (wanted === tag.name) return tag;

	const existing = db
		.select({
			id: tags.id,
			name: tags.name,
			color: tags.color,
			description: tags.description
		})
		.from(tags)
		.where(and(eq(tags.name, wanted), eq(tags.userId, userId)))
		.get();

	if (!existing) {
		db.update(tags).set({ name: wanted }).where(eq(tags.id, tag.id)).run();
		return { ...tag, name: wanted };
	}

	for (const carrier of CARRIERS) {
		const rows = db
			.select({
				id: carrier.table.id,
				owner: carrier.owner,
				tagId: carrier.table.tagId,
				taggedAt: carrier.taggedAt ?? sql<string | null>`null`
			})
			.from(carrier.table)
			.where(
				and(eq(carrier.table.userId, userId), inArray(carrier.table.tagId, [tag.id, existing.id]))
			)
			.all();

		const surviving = new Map<number, { id: number; taggedAt: string | null }>();
		for (const row of rows)
			if (row.tagId === existing.id)
				surviving.set(row.owner, { id: row.id, taggedAt: row.taggedAt });

		for (const row of rows) {
			if (row.tagId !== tag.id) continue;
			const already = surviving.get(row.owner);
			if (!already) {
				// Repointed rather than rewritten, so the date the label went on
				// survives the rename.
				db.update(carrier.table)
					.set({ tagId: existing.id })
					.where(eq(carrier.table.id, row.id))
					.run();
				continue;
			}
			if (
				carrier.taggedAt &&
				row.taggedAt &&
				(!already.taggedAt || row.taggedAt < already.taggedAt)
			)
				db.update(carrier.table)
					.set({ taggedAt: row.taggedAt })
					.where(eq(carrier.table.id, already.id))
					.run();
			db.delete(carrier.table).where(eq(carrier.table.id, row.id)).run();
		}
	}

	if (!existing.color && tag.color)
		db.update(tags).set({ color: tag.color }).where(eq(tags.id, existing.id)).run();
	db.delete(tags).where(eq(tags.id, tag.id)).run();

	return { ...existing, color: existing.color ?? tag.color };
}

/**
 * Take a label out of the vocabulary, and off everything that carried it.
 *
 * The join rows go explicitly rather than by cascade: the same statement then
 * does the same thing whether or not foreign keys are on, which they are not
 * during a migration.
 */
export function deleteTag(userId: string, id: number): void {
	const tag = tagOf(id, userId);
	for (const carrier of CARRIERS)
		db.delete(carrier.table)
			.where(and(eq(carrier.table.userId, userId), eq(carrier.table.tagId, tag.id)))
			.run();
	db.delete(tags).where(eq(tags.id, tag.id)).run();
}

/** The label the account calls this word, if it has one. */
export function tagByName(userId: string, name: unknown): TagRow {
	const wanted = tagName(name);
	const found = db
		.select({
			id: tags.id,
			name: tags.name,
			color: tags.color,
			description: tags.description
		})
		.from(tags)
		.where(and(eq(tags.name, wanted), eq(tags.userId, userId)))
		.get();
	if (!found) throw new NotFoundError('tag');
	return found;
}

/**
 * The carriers that can be inside a notebook, and what each one counts as.
 *
 * `CARRIERS` above is every table that joins a tag to something; this is the
 * subset whose things are filed under a subject. Pictures and the repeating
 * week are not — a picture belongs to the gallery and a repeating block to the
 * template — so a tag's uses inside a notebook are these three kinds and no
 * others. `kind` is what the count is called on screen, in `USE_ORDER`.
 */
const FILED = [
	{
		kind: 'notes' as const,
		join: diaryEntryTags,
		owner: diaryEntryTags.entryId,
		thing: diaryEntries
	},
	{ kind: 'tasks' as const, join: todoTags, owner: todoTags.todoId, thing: todoTasks },
	{
		kind: 'tasks' as const,
		join: exceptionalTaskTags,
		owner: exceptionalTaskTags.taskId,
		thing: exceptionalTasks
	},
	{ kind: 'ideas' as const, join: ideaTags, owner: ideaTags.ideaId, thing: ideas }
];

/**
 * What a label means here, in the account's own words.
 *
 * Empty takes the meaning off again, which is a real answer: most labels are
 * a word that explains itself.
 */
export function describeTag(userId: string, id: number, description: unknown): TagRow {
	const tag = tagOf(id, userId);
	const said = optionalStr(description, 'description', {
		max: MAX_TAG_DESCRIPTION_LENGTH
	}).trim();
	db.update(tags).set({ description: said }).where(eq(tags.id, tag.id)).run();
	return { ...tag, description: said };
}

/**
 * One notebook's labels, with what carries each of them in there.
 *
 * The Tags screen counted a word across the whole account, which answers a
 * question nobody has: `#home` doing forty things somewhere is not why it is
 * on this renovation. Here the count is the subject's own, and it is broken
 * down by kind — two notes and one task — because "three things have it" does
 * not say where to go and look.
 *
 * A label the notebook hands new notes by default is listed at nought, once
 * it exists at all: it is part of this subject's vocabulary whether or not
 * anything in here wears it yet. A suggestion nobody has ever used anywhere is
 * not listed, because there is nothing to list — default tags are stored as
 * the text somebody typed, and a word becomes a label by being put on
 * something.
 */
export function tagsInNotebook(userId: string, notebookId: number): NotebookTag[] {
	return countedTags(userId, notebookId);
}

/**
 * The same reading of the whole account: every label, and what carries it.
 *
 * The Tags screen had a bare number per label — "3 things carry it" — which
 * says how much a word is doing and not one thing about where. The kinds are
 * the same words the notebook version uses, plus the pictures, which are the
 * one carrier that is never filed under a subject.
 */
export function tagsWithUses(userId: string): NotebookTag[] {
	return countedTags(userId, null);
}

/** One notebook's labels, or the account's when no notebook is named. */
function countedTags(userId: string, notebookId: number | null): NotebookTag[] {
	/** tag id → kind → how many. */
	const counts = new Map<number, Map<TagUseKind, number>>();
	const bump = (tagId: number, kind: TagUseKind, n: number) => {
		const kinds = counts.get(tagId) ?? new Map<TagUseKind, number>();
		kinds.set(kind, (kinds.get(kind) ?? 0) + n);
		counts.set(tagId, kinds);
	};

	for (const { kind, join, owner, thing } of FILED) {
		const rows = db
			.select({ tagId: join.tagId, n: count() })
			.from(join)
			.innerJoin(thing, and(eq(thing.id, owner), eq(thing.userId, userId)))
			.where(
				notebookId === null
					? eq(join.userId, userId)
					: and(eq(join.userId, userId), eq(thing.notebookId, notebookId))
			)
			.groupBy(join.tagId)
			.all();
		for (const row of rows) bump(row.tagId, kind, Number(row.n));
	}

	/*
	 * The carriers that are nowhere near a notebook, counted only when the
	 * whole account is the question: a picture belongs to the gallery, and a
	 * repeating block to the template rather than to a subject. The repeating
	 * ones count as tasks — a block and a todo are the same task at two
	 * stages, which is how the notebook tabs count them too.
	 */
	if (notebookId === null)
		for (const [kind, join] of [
			['pictures', mediaTags],
			['tasks', recurringTaskTags]
		] as const) {
			const rows = db
				.select({ tagId: join.tagId, n: count() })
				.from(join)
				.where(eq(join.userId, userId))
				.groupBy(join.tagId)
				.all();
			for (const row of rows) bump(row.tagId, kind, Number(row.n));
		}

	// The notebook's own suggestions, by name — they are stored as the text
	// somebody typed rather than as rows, which is why this is a second read.
	const suggested =
		notebookId === null
			? new Set<string>()
			: new Set(
					parseTags(
						db
							.select({ defaultTags: notebooks.defaultTags })
							.from(notebooks)
							.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
							.get()?.defaultTags ?? ''
					)
				);

	const wanted = db
		.select({
			id: tags.id,
			name: tags.name,
			color: tags.color,
			description: tags.description
		})
		.from(tags)
		.where(eq(tags.userId, userId))
		.orderBy(tags.name)
		.all()
		// The account's own listing keeps a label nothing carries: it exists,
		// and the screen it is on is where it is deleted.
		.filter((tag) => notebookId === null || counts.has(tag.id) || suggested.has(tag.name));

	return wanted.map((tag) => {
		const kinds = counts.get(tag.id);
		const by = USE_ORDER.filter((kind) => (kinds?.get(kind) ?? 0) > 0).map((kind) => ({
			kind,
			count: kinds?.get(kind) ?? 0
		}));
		return { ...tag, uses: by.reduce((sum, one) => sum + one.count, 0), by };
	});
}

/**
 * The labels each notebook uses: the ones on the notes, tasks and ideas filed
 * in it, and the ones it hands a new note by default.
 *
 * What a tag field suggests once a notebook is chosen — a subject's own few
 * words rather than the whole account's vocabulary. Every row read is this
 * account's own, so a notebook somebody else filed things in contributes only
 * what this account filed there.
 */
export function tagsByNotebook(userId: string): Record<number, string[]> {
	const byNotebook = new Map<number, Set<string>>();
	const add = (notebookId: number | null, name: string) => {
		if (notebookId === null || !name) return;
		const names = byNotebook.get(notebookId) ?? new Set<string>();
		names.add(name);
		byNotebook.set(notebookId, names);
	};

	for (const { join, owner, thing } of FILED) {
		const rows = db
			.selectDistinct({ notebookId: thing.notebookId, name: tags.name })
			.from(join)
			.innerJoin(thing, and(eq(thing.id, owner), eq(thing.userId, userId)))
			.innerJoin(tags, and(eq(tags.id, join.tagId), eq(tags.userId, userId)))
			.where(and(eq(join.userId, userId), isNotNull(thing.notebookId)))
			.all();
		for (const row of rows) add(row.notebookId, row.name);
	}

	const defaults = db
		.select({ id: notebooks.id, defaultTags: notebooks.defaultTags })
		.from(notebooks)
		.where(and(eq(notebooks.userId, userId), sql`${notebooks.defaultTags} <> ''`))
		.all();
	for (const notebook of defaults)
		for (const name of parseTags(notebook.defaultTags)) add(notebook.id, name);

	return Object.fromEntries(
		[...byNotebook].map(([id, names]) => [id, [...names].sort((a, b) => a.localeCompare(b))])
	);
}

/** One notebook's labels — nothing, for a notebook this account never filed anything in. */
export function notebookTags(userId: string, notebookId: number): string[] {
	return tagsByNotebook(userId)[notebookId] ?? [];
}
