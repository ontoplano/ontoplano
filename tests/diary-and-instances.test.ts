/**
 * The journal, and what happens to a block once the day arrives.
 *
 * A diary entry is numbered per account and the number is what `#12` means, so
 * it must never be reused or reassigned. An occurrence carries the other half:
 * whether it happened, and — derived rather than chosen — whether it happened
 * on time. Timing only exists once something is done, and is cleared when it
 * is reopened, or the record says a thing was "late" that has not happened.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let diary: typeof import('../src/lib/server/services/diary');
let instances: typeof import('../src/lib/server/services/instances');
let slots: typeof import('../src/lib/server/services/slots');
let activities: typeof import('../src/lib/server/services/activities');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

beforeAll(async () => {
	diary = await import('../src/lib/server/services/diary');
	instances = await import('../src/lib/server/services/instances');
	slots = await import('../src/lib/server/services/slots');
	activities = await import('../src/lib/server/services/activities');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
});

describe('the journal', () => {
	test('numbers entries per account, from one', () => {
		const first = diary.createEntry(ctx, { content: 'the first thing' });
		const second = diary.createEntry(ctx, { content: 'the second thing' });

		const entries = diary.listEntries(ctx);
		expect(entries.find((e) => e.id === first)!.seq).toBe(1);
		expect(entries.find((e) => e.id === second)!.seq).toBe(2);

		// Another account starts at one too — the number is the account's.
		const elsewhere = diary.createEntry(theirs, { content: 'theirs' });
		expect(diary.listEntries(theirs).find((e) => e.id === elsewhere)!.seq).toBe(1);
	});

	test('does not reuse a number when an entry is deleted', () => {
		// `#12` in something written months ago has to keep meaning what it did.
		const doomed = diary.createEntry(ctx, { content: 'about to go' });
		const seq = diary.listEntries(ctx).find((e) => e.id === doomed)!.seq;
		diary.deleteEntry(ctx, doomed);

		const next = diary.createEntry(ctx, { content: 'after the deletion' });
		expect(diary.listEntries(ctx).find((e) => e.id === next)!.seq).toBeGreaterThan(seq);
	});

	test('carries tags, and replacing them is posting the rest', () => {
		const id = diary.createEntry(ctx, { content: 'gym then reading', tags: 'health, reading' });
		expect(
			diary
				.listEntries(ctx)
				.find((e) => e.id === id)!
				.tags.map((t) => t.name)
		).toEqual(expect.arrayContaining(['health', 'reading']));

		diary.updateEntry(ctx, id, { content: 'gym then reading', tags: 'health' });
		expect(
			diary
				.listEntries(ctx)
				.find((e) => e.id === id)!
				.tags.map((t) => t.name)
		).toEqual(['health']);
	});

	test('refuses an empty entry', () => {
		expect(() => diary.createEntry(ctx, { content: '   ' })).toThrow();
	});

	test('knows the most recent one', () => {
		const id = diary.createEntry(ctx, { content: 'the latest thing' });
		expect(diary.latestEntry(ctx)?.id).toBe(id);
	});

	test("is not another account's to change", () => {
		const mine = diary.listEntries(ctx)[0];
		expect(() => diary.updateEntry(theirs, mine.id, { content: 'taken' })).toThrow();
		expect(() => diary.deleteEntry(theirs, mine.id)).toThrow();
	});
});

describe('an occurrence of a block', () => {
	function anOccurrence(): number {
		const slot = slots.createSlot(ctx, {
			weekday: 0,
			startTime: '09:00',
			durationMinutes: 60,
			mode: 'category',
			categoryId: work,
			label: 'Deep work'
		});
		instances.generateInstances(
			ctx,
			new Date('2026-08-17T00:00:00'),
			new Date('2026-08-18T00:00:00')
		);
		const made = instances
			.listForDate(ctx, new Date('2026-08-17T00:00:00'))
			.find((o) => o.slotId === slot)!;
		return made.id;
	}

	test('is generated once per day, however many times it is asked for', () => {
		const id = anOccurrence();
		const before = instances.listForDate(ctx, new Date('2026-08-17T00:00:00')).length;

		instances.generateInstances(
			ctx,
			new Date('2026-08-17T00:00:00'),
			new Date('2026-08-18T00:00:00')
		);

		// Every page load calls this; a second row per visit would be a disaster
		// that only shows up as a slowly filling grid.
		expect(instances.listForDate(ctx, new Date('2026-08-17T00:00:00'))).toHaveLength(before);
		expect(id).toBeTruthy();
	});

	test('gains a timing when it is finished, and loses it when reopened', () => {
		const id = anOccurrence();

		instances.setInstanceStatus(ctx, id, 'done');
		const done = instances
			.listForDate(ctx, new Date('2026-08-17T00:00:00'))
			.find((o) => o.id === id)!;
		expect(done.status).toBe('done');
		expect(done.timing).toBeTruthy();

		instances.setInstanceStatus(ctx, id, 'todo');
		const reopened = instances
			.listForDate(ctx, new Date('2026-08-17T00:00:00'))
			.find((o) => o.id === id)!;
		// A record that says a thing was "late" when it has not happened is a
		// record that is wrong.
		expect(reopened.timing).toBeNull();
	});

	test('can have its timing corrected by hand', () => {
		const id = anOccurrence();
		instances.setInstanceStatus(ctx, id, 'done');

		instances.setInstanceTiming(ctx, id, 'early');
		expect(
			instances.listForDate(ctx, new Date('2026-08-17T00:00:00')).find((o) => o.id === id)!.timing
		).toBe('early');

		expect(() => instances.setInstanceTiming(ctx, id, 'whenever')).toThrow();
	});

	test('refuses a status that is not one', () => {
		const id = anOccurrence();
		expect(() => instances.setInstanceStatus(ctx, id, 'nearly')).toThrow();
	});

	test('takes a label of its own without touching the block', () => {
		const id = anOccurrence();
		instances.setInstanceLabel(ctx, id, 'Deep work — the hard bit');
		expect(
			instances.listForDate(ctx, new Date('2026-08-17T00:00:00')).find((o) => o.id === id)!.title
		).toContain('the hard bit');
	});

	test("is not another account's to touch", () => {
		const id = anOccurrence();
		expect(() => instances.setInstanceStatus(theirs, id, 'done')).toThrow();
		expect(() => instances.deleteInstance(theirs, id)).toThrow();
	});
});
