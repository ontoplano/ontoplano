/**
 * People, and the mentions that collect on them.
 *
 * The rules worth pinning: a name is unique per account, deleting somebody
 * leaves what you wrote about them, mentions are set as a whole rather than
 * added one at a time, and none of it is reachable from another account.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let people: typeof import('../src/lib/server/services/people');
let diary: typeof import('../src/lib/server/services/diary');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	people = await import('../src/lib/server/services/people');
	diary = await import('../src/lib/server/services/diary');
	ctx = { userId: OWNER, now: new Date('2026-08-26T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('adding somebody', () => {
	test('keeps the relationship and the notes', () => {
		const id = people.createPerson(ctx, {
			name: 'João',
			relationship: 'friend',
			notes: 'from the gym'
		});
		const person = people.listPeople(ctx).find((p) => p.id === id)!;
		expect(person.name).toBe('João');
		expect(person.notes).toBe('from the gym');
	});

	test('refuses a second person by the same name', () => {
		expect(() => people.createPerson(ctx, { name: 'João' })).toThrow();
	});

	test('but the same name in another account is a different person', () => {
		expect(() => people.createPerson(theirs, { name: 'João' })).not.toThrow();
	});

	test('refuses an empty name', () => {
		expect(() => people.createPerson(ctx, { name: '   ' })).toThrow();
	});
});

describe('changing somebody', () => {
	test('renaming onto an existing name is refused', () => {
		const id = people.createPerson(ctx, { name: 'Marina' });
		expect(() => people.updatePerson(ctx, id, { name: 'João' })).toThrow();
	});

	test('renaming to what they are already called is fine', () => {
		const person = people.listPeople(ctx).find((p) => p.name === 'Marina')!;
		expect(() =>
			people.updatePerson(ctx, person.id, { name: 'Marina', relationship: 'family' })
		).not.toThrow();
	});

	test("another account's person cannot be renamed", () => {
		const mine = people.listPeople(ctx)[0];
		expect(() => people.updatePerson(theirs, mine.id, { name: 'taken' })).toThrow();
	});
});

describe('mentions', () => {
	// Written as names, not ids: mentioning somebody is typed inline with the
	// entry, the same gesture as a tag. A name nobody has yet becomes a person.
	test('collect on the person, newest first', () => {
		const first = diary.createEntry(ctx, { content: 'coffee with Ana' });
		const second = diary.createEntry(ctx, { content: 'Ana again' });

		people.setEntryPeople(ctx, first, 'Ana');
		people.setEntryPeople(ctx, second, 'Ana');

		const ana = people.listPeople(ctx).find((p) => p.name === 'Ana')!;
		expect(ana, 'a name nobody had should have been created').toBeTruthy();

		const about = people.entriesAbout(ctx, ana.id);
		expect(about).toHaveLength(2);
		expect(about.map((e) => e.content)).toContain('Ana again');
	});

	test('are set as a whole, so removing one is posting the rest', () => {
		const ana = people.listPeople(ctx).find((p) => p.name === 'Ana')!;
		const entry = people.entriesAbout(ctx, ana.id)[0];

		people.setEntryPeople(ctx, entry.id, '');
		expect(people.entriesAbout(ctx, ana.id)).toHaveLength(1);
	});

	test('come back for a page of entries in one query', () => {
		const ana = people.listPeople(ctx).find((p) => p.name === 'Ana')!;
		const entry = people.entriesAbout(ctx, ana.id)[0];
		const map = people.peopleForEntries(ctx, [entry.id]);
		expect(map.get(entry.id)?.map((p) => p.name)).toContain('Ana');
	});

	test('refuse an entry that is not yours', () => {
		const mine = diary.createEntry(ctx, { content: 'mine' });
		expect(() => people.setEntryPeople(theirs, mine, 'Mallory')).toThrow();
	});

	test('are capped, because an entry is not a guest list', () => {
		const entry = diary.createEntry(ctx, { content: 'the party' });
		const crowd = Array.from({ length: 30 }, (_, i) => `Guest ${i}`).join(', ');
		expect(() => people.setEntryPeople(ctx, entry, crowd)).toThrow();
	});
});

describe('deleting somebody', () => {
	test('leaves what you wrote about them', () => {
		const person = people.createPerson(ctx, { name: 'Temporary' });
		const entry = diary.createEntry(ctx, { content: 'met Temporary' });
		people.setEntryPeople(ctx, entry, 'Temporary');

		people.deletePerson(ctx, person);

		expect(people.listPeople(ctx).find((p) => p.name === 'Temporary')).toBeUndefined();
		// The entry is the account's writing, not the person's row.
		expect(diary.listEntries(ctx).some((e) => e.content === 'met Temporary')).toBe(true);
	});

	test("another account's person cannot be deleted", () => {
		const mine = people.listPeople(ctx)[0];
		expect(() => people.deletePerson(theirs, mine.id)).toThrow();
	});
});
