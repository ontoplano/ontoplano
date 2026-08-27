import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { isRelationship, parsePeople, type Relationship } from '../../people.js';
import { db } from '../db/index.js';
import { diaryEntries, entryPeople, people } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { stamps } from './time.js';
import { optionalStr, str } from './validate.js';

/**
 * The people in your life, and where they turn up.
 *
 * Deliberately thin: a name, how you know them, and a note. The value is not
 * the record — it is that every entry mentioning them collects into one page,
 * which a free-form tag cannot do because a tag has no identity beyond its
 * spelling.
 */

export const MAX_NAME_LENGTH = 100;
export const MAX_NOTES_LENGTH = 2000;

export type Person = {
	id: number;
	name: string;
	relationship: Relationship;
	notes: string;
	mentions: number;
};

export function listPeople(ctx: Ctx): Person[] {
	const rows = db
		.select({
			id: people.id,
			name: people.name,
			relationship: people.relationship,
			notes: people.notes,
			mentions: sql<number>`count(${entryPeople.id})`.as('mentions')
		})
		.from(people)
		.leftJoin(entryPeople, eq(entryPeople.personId, people.id))
		.where(eq(people.userId, ctx.userId))
		.groupBy(people.id)
		.orderBy(people.name)
		.all();

	return rows.map((r) => ({ ...r, notes: r.notes ?? '', relationship: r.relationship }));
}

/** Everything written that mentions this person, newest first. */
export function entriesAbout(ctx: Ctx, personId: number) {
	assertOwned(ctx, personId);

	return db
		.select({
			id: diaryEntries.id,
			seq: diaryEntries.seq,
			content: diaryEntries.content,
			forDate: diaryEntries.forDate,
			createdAt: diaryEntries.createdAt
		})
		.from(entryPeople)
		.innerJoin(diaryEntries, eq(entryPeople.entryId, diaryEntries.id))
		.where(and(eq(entryPeople.personId, personId), eq(entryPeople.userId, ctx.userId)))
		.orderBy(desc(diaryEntries.createdAt))
		.all();
}

export function createPerson(
	ctx: Ctx,
	raw: { name: unknown; relationship?: unknown; notes?: unknown }
): number {
	const name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });
	if (personNamed(ctx, name)) throw new ConflictError('Somebody by that name already exists');

	const result = db
		.insert(people)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			name,
			relationship: parseRelationship(raw.relationship),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH })
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updatePerson(
	ctx: Ctx,
	id: number,
	raw: { name: unknown; relationship?: unknown; notes?: unknown }
): void {
	const name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });

	const clash = personNamed(ctx, name);
	if (clash && clash.id !== id) throw new ConflictError('Somebody by that name already exists');

	const res = db
		.update(people)
		.set({
			name,
			relationship: parseRelationship(raw.relationship),
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH }),
			updatedAt: stamps(ctx).updatedAt
		})
		.where(and(eq(people.id, id), eq(people.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('person');
}

/** Deleting a person leaves the entries; only the mentions go. */
export function deletePerson(ctx: Ctx, id: number): void {
	const res = db
		.delete(people)
		.where(and(eq(people.id, id), eq(people.userId, ctx.userId)))
		.run();

	if (res.changes === 0) throw new NotFoundError('person');
}

/**
 * Replace the people an entry mentions, creating any that are new.
 *
 * Written as names rather than ids because it is typed inline with the entry —
 * the same gesture as tags, and stopping to open a picker is how a journal
 * stops being written in.
 */
export function setEntryPeople(ctx: Ctx, entryId: number, raw: unknown): void {
	const names = parsePeople(raw === undefined || raw === null ? '' : String(raw));
	if (names.length > 25) throw new ValidationError('That is a lot of people for one entry');

	const owned = db
		.select({ id: diaryEntries.id })
		.from(diaryEntries)
		.where(and(eq(diaryEntries.id, entryId), eq(diaryEntries.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('entry');

	const ids = names.map((name) => {
		const existing = personNamed(ctx, name);
		if (existing) return existing.id;
		return createPerson(ctx, { name });
	});

	db.transaction((tx) => {
		tx.delete(entryPeople)
			.where(and(eq(entryPeople.entryId, entryId), eq(entryPeople.userId, ctx.userId)))
			.run();

		for (const personId of ids)
			tx.insert(entryPeople).values({ userId: ctx.userId, entryId, personId }).run();
	});
}

/** The people each of these entries mentions, keyed by entry id. */
export function peopleForEntries(ctx: Ctx, entryIds: number[]): Map<number, Person[]> {
	const byEntry = new Map<number, Person[]>();
	if (entryIds.length === 0) return byEntry;

	const rows = db
		.select({
			entryId: entryPeople.entryId,
			id: people.id,
			name: people.name,
			relationship: people.relationship,
			notes: people.notes
		})
		.from(entryPeople)
		.innerJoin(people, eq(entryPeople.personId, people.id))
		.where(and(eq(entryPeople.userId, ctx.userId), inArray(entryPeople.entryId, entryIds)))
		.orderBy(people.name)
		.all();

	for (const row of rows) {
		const list = byEntry.get(row.entryId) ?? [];
		list.push({
			id: row.id,
			name: row.name,
			relationship: row.relationship,
			notes: row.notes ?? '',
			mentions: 0
		});
		byEntry.set(row.entryId, list);
	}

	return byEntry;
}

function personNamed(ctx: Ctx, name: string) {
	return db
		.select({ id: people.id })
		.from(people)
		.where(and(eq(people.userId, ctx.userId), eq(people.name, name)))
		.get();
}

function assertOwned(ctx: Ctx, id: number): void {
	const owned = db
		.select({ id: people.id })
		.from(people)
		.where(and(eq(people.id, id), eq(people.userId, ctx.userId)))
		.get();

	if (!owned) throw new NotFoundError('person');
}

function parseRelationship(value: unknown): Relationship {
	if (value === undefined || value === null || value === '') return 'other';
	if (!isRelationship(value)) throw new ValidationError('Unknown relationship');
	return value;
}
