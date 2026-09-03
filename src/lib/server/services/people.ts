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
export const MAX_PHONE_LENGTH = 40;
export const MAX_EMAIL_LENGTH = 200;

export type Person = {
	id: number;
	name: string;
	relationship: Relationship;
	/** `YYYY-MM-DD`, or `--MM-DD` when the year is not known. Null if unset. */
	birthday: string | null;
	/** Whether that birthday is announced on the morning. Ignored without one. */
	remindOnBirthday: boolean;
	phone: string | null;
	email: string | null;
	notes: string;
	/** The one picture of them, or null. */
	pictureId: number | null;
	mentions: number;
};

/**
 * A birthday you may only half know.
 *
 * Kept as written rather than as a date: somebody whose birthday is the 14th of
 * March, year unknown, is the ordinary case in an address book, and a Date
 * cannot hold that. `--MM-DD` is vCard's answer to the same problem.
 *
 * An empty box clears it. Anything that is neither shape is refused rather than
 * silently stored, so the field can be read back without guessing.
 */
function parseBirthday(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	const raw = String(value).trim();
	if (raw === '') return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw) || /^--\d{2}-\d{2}$/.test(raw)) {
		const month = Number(raw.slice(-5, -3));
		const day = Number(raw.slice(-2));
		if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return raw;
	}
	throw new ValidationError('A birthday looks like 1990-03-14, or --03-14 without the year');
}

/**
 * Whether to be told about it, as a form sends the answer.
 *
 * An unticked checkbox is not submitted at all, so `undefined` has to mean
 * *off* — reading it as "unset, therefore the default" would make the box
 * impossible to untick. New people arrive through forms that carry it, and the
 * column's own default covers the rows that existed before there was a box.
 */
function wantsBirthday(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (value === undefined || value === null) return false;
	const raw = String(value).trim().toLowerCase();
	return raw === 'on' || raw === 'true' || raw === '1' || raw === 'yes';
}

export function listPeople(ctx: Ctx): Person[] {
	const rows = db
		.select({
			id: people.id,
			name: people.name,
			relationship: people.relationship,
			birthday: people.birthday,
			remindOnBirthday: people.remindOnBirthday,
			phone: people.phone,
			email: people.email,
			notes: people.notes,
			// The face, when there is one. An id rather than the bytes: the row
			// draws `/media/<id>`, which the browser caches for good.
			pictureId: people.pictureId,
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
	raw: {
		name: unknown;
		relationship?: unknown;
		birthday?: unknown;
		remindOnBirthday?: unknown;
		phone?: unknown;
		email?: unknown;
		notes?: unknown;
	}
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
			birthday: parseBirthday(raw.birthday),
			remindOnBirthday: wantsBirthday(raw.remindOnBirthday),
			phone: optionalStr(raw.phone, 'phone', { max: MAX_PHONE_LENGTH }) || null,
			email: optionalStr(raw.email, 'email', { max: MAX_EMAIL_LENGTH }) || null,
			notes: optionalStr(raw.notes, 'notes', { max: MAX_NOTES_LENGTH })
		})
		.run();

	return Number(result.lastInsertRowid);
}

export function updatePerson(
	ctx: Ctx,
	id: number,
	raw: {
		name: unknown;
		relationship?: unknown;
		birthday?: unknown;
		remindOnBirthday?: unknown;
		phone?: unknown;
		email?: unknown;
		notes?: unknown;
	}
): void {
	const name = str(raw.name, 'name', { max: MAX_NAME_LENGTH });

	const clash = personNamed(ctx, name);
	if (clash && clash.id !== id) throw new ConflictError('Somebody by that name already exists');

	const res = db
		.update(people)
		.set({
			name,
			relationship: parseRelationship(raw.relationship),
			birthday: parseBirthday(raw.birthday),
			remindOnBirthday: wantsBirthday(raw.remindOnBirthday),
			phone: optionalStr(raw.phone, 'phone', { max: MAX_PHONE_LENGTH }) || null,
			email: optionalStr(raw.email, 'email', { max: MAX_EMAIL_LENGTH }) || null,
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

/** What a mention chip needs: who, and how you know them. */
export type Mentioned = Pick<Person, 'id' | 'name' | 'relationship'>;

/** The people each of these entries mentions, keyed by entry id. */
export function peopleForEntries(ctx: Ctx, entryIds: number[]): Map<number, Mentioned[]> {
	const byEntry = new Map<number, Mentioned[]>();
	if (entryIds.length === 0) return byEntry;

	const rows = db
		.select({
			entryId: entryPeople.entryId,
			id: people.id,
			name: people.name,
			relationship: people.relationship
		})
		.from(entryPeople)
		.innerJoin(people, eq(entryPeople.personId, people.id))
		.where(and(eq(entryPeople.userId, ctx.userId), inArray(entryPeople.entryId, entryIds)))
		.orderBy(people.name)
		.all();

	for (const row of rows) {
		const list = byEntry.get(row.entryId) ?? [];
		list.push({ id: row.id, name: row.name, relationship: row.relationship });
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
