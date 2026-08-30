/**
 * Saving a week and putting one back, and the metadata a block can carry.
 *
 * A scheme is the whole weekly plan photographed: applying one REPLACES what
 * is there, which is the only destructive thing in the planner that is not a
 * delete — so what it copies and what it drops both matter.
 *
 * The metadata is free-form and comes from a form, which is to say it comes
 * from anywhere: the parsing has to refuse what it cannot store rather than
 * store a shape nothing can read back.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let schemes: typeof import('../src/lib/server/services/schemes');
let slots: typeof import('../src/lib/server/services/slots');
let activities: typeof import('../src/lib/server/services/activities');
let meta: typeof import('../src/lib/server/services/meta');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

beforeAll(async () => {
	schemes = await import('../src/lib/server/services/schemes');
	slots = await import('../src/lib/server/services/slots');
	activities = await import('../src/lib/server/services/activities');
	meta = await import('../src/lib/server/services/meta');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
});

function aBlock(weekday: number, startTime: string) {
	return slots.createSlot(ctx, {
		weekday,
		startTime,
		durationMinutes: 60,
		mode: 'category',
		categoryId: work,
		label: `block ${weekday} ${startTime}`
	});
}

describe('saving a week', () => {
	test('photographs every block that is there', () => {
		aBlock(0, '09:00');
		aBlock(2, '14:00');

		const id = schemes.saveScheme(ctx, 'Term time');
		const saved = schemes.listSchemes(ctx).find((s) => s.id === id)!;
		expect(saved.name).toBe('Term time');

		// What it photographed is only visible by putting it back, which is
		// also the only thing anybody does with a scheme.
		slots.clearWeeklyPlan(ctx);
		schemes.applyScheme(ctx, id);
		expect(slots.listWeeklySlots(ctx)).toHaveLength(2);
	});

	test('refuses a second scheme by the same name', () => {
		expect(() => schemes.saveScheme(ctx, 'Term time')).toThrow();
	});

	test('refuses a nameless one', () => {
		expect(() => schemes.saveScheme(ctx, '   ')).toThrow();
	});

	test('an empty week is still a scheme — that is what Blank means', () => {
		slots.clearWeeklyPlan(ctx);
		const id = schemes.saveScheme(ctx, 'Nothing at all');
		schemes.applyScheme(ctx, id);
		expect(slots.listWeeklySlots(ctx)).toHaveLength(0);
	});
});

describe('putting one back', () => {
	test('replaces the plan rather than adding to it', () => {
		// A different week to overwrite.
		aBlock(4, '18:00');
		expect(slots.listWeeklySlots(ctx)).toHaveLength(1);

		const termTime = schemes.listSchemes(ctx).find((s) => s.name === 'Term time')!;
		schemes.applyScheme(ctx, termTime.id);

		const now = slots.listWeeklySlots(ctx);
		expect(now).toHaveLength(2);
		expect(now.some((s) => s.startTime === '18:00')).toBe(false);
	});

	test("another account's scheme cannot be applied, renamed or deleted", () => {
		const mine = schemes.listSchemes(ctx)[0];
		expect(() => schemes.applyScheme(theirs, mine.id)).toThrow();
		expect(() => schemes.renameScheme(theirs, mine.id, 'taken')).toThrow();
		expect(() => schemes.deleteScheme(theirs, mine.id)).toThrow();
	});

	test('renaming onto another scheme’s name is refused', () => {
		const [first, second] = schemes.listSchemes(ctx);
		expect(() => schemes.renameScheme(ctx, second.id, first.name)).toThrow();
	});

	test('deleting one leaves the plan alone', () => {
		const before = slots.listWeeklySlots(ctx).length;
		const spare = schemes.listSchemes(ctx).find((s) => s.name === 'Nothing at all')!;
		schemes.deleteScheme(ctx, spare.id);
		expect(slots.listWeeklySlots(ctx)).toHaveLength(before);
	});
});

describe('the metadata a block carries', () => {
	test('reads back what was stored', () => {
		expect(meta.parseMeta('{"room":"B12","tutor":"Ana"}')).toEqual({ room: 'B12', tutor: 'Ana' });
	});

	test('turns numbers and booleans into strings rather than losing them', () => {
		expect(meta.parseMeta('{"seats":12,"online":true}')).toEqual({
			seats: '12',
			online: 'true'
		});
	});

	test('answers nothing to anything it cannot read, rather than throwing', () => {
		// It comes out of a column that anything could have written.
		expect(meta.parseMeta(null)).toEqual({});
		expect(meta.parseMeta('not json at all')).toEqual({});
		expect(meta.parseMeta('[1,2,3]')).toEqual({});
		expect(meta.parseMeta('"a string"')).toEqual({});
	});

	test('serialises an object, and refuses a shape it cannot store', () => {
		expect(JSON.parse(meta.serialiseMeta({ room: 'B12' }))).toEqual({ room: 'B12' });
		expect(meta.serialiseMeta(undefined)).toBe('{}');
		expect(meta.serialiseMeta('')).toBe('{}');
		expect(() => meta.serialiseMeta([1, 2, 3])).toThrow();
	});

	test('refuses a key that is not an identifier', () => {
		// The keys are shown as columns and read by plugins; one with a space in
		// it, or starting with a digit, is a key nothing downstream can address.
		expect(() => meta.serialiseMeta({ 'not a key': 'x' })).toThrow();
		expect(() => meta.serialiseMeta({ '9lives': 'x' })).toThrow();
	});

	test('but normalises case rather than refusing it', () => {
		// A form gives you whatever the person typed. `Room` is not a mistake
		// worth a refusal; it is `room`.
		expect(JSON.parse(meta.serialiseMeta({ Room: 'B12' }))).toEqual({ room: 'B12' });
	});

	test('an emptied value removes the key rather than storing a blank', () => {
		expect(JSON.parse(meta.serialiseMeta({ room: 'B12', tutor: '' }))).toEqual({ room: 'B12' });
	});

	test('refuses a key or value too long to belong in a column', () => {
		expect(() => meta.serialiseMeta({ ['k'.repeat(200)]: 'x' })).toThrow(/longer than/);
		expect(() => meta.serialiseMeta({ room: 'x'.repeat(5000) })).toThrow(/longer than/);
	});

	test('refuses a value that is not something a label could show', () => {
		expect(() => meta.serialiseMeta({ room: { floor: 2 } })).toThrow(/must be a string/);
	});

	test('and a block that carries far too many pairs', () => {
		// Metadata is a handful of notes on a block, not a table of its own.
		const many: Record<string, string> = {};
		for (let i = 0; i < 100; i++) many[`k${i}`] = 'x';
		expect(() => meta.serialiseMeta(many)).toThrow(/at most/);
	});
});

describe('the metadata a form submits', () => {
	/** The parallel `metaKey`/`metaValue` lists a repeatable editor produces. */
	function form(pairs: [string, string][], extra?: Record<string, string>) {
		const data = new FormData();
		for (const [key, value] of pairs) {
			data.append('metaKey', key);
			data.append('metaValue', value);
		}
		for (const [k, v] of Object.entries(extra ?? {})) data.set(k, v);
		return data;
	}

	test('reads the pairs off in order', () => {
		expect(
			JSON.parse(
				meta.metaFromFormData(
					form([
						['room', 'B12'],
						['tutor', 'Ana']
					])
				)
			)
		).toEqual({ room: 'B12', tutor: 'Ana' });
	});

	test('skips a row where nobody typed a key', () => {
		expect(JSON.parse(meta.metaFromFormData(form([['', 'orphaned']])))).toEqual({});
	});

	test('a key with no value clears that key', () => {
		expect(JSON.parse(meta.metaFromFormData(form([['room', '']])))).toEqual({});
	});

	test('a drag that posts only a placement leaves metadata alone', () => {
		// This is the distinction that matters. Drag and resize post to the same
		// update action with the placement fields only; returning `{}` would
		// silently wipe a block's alarm settings every time it was moved.
		const dragged = new FormData();
		dragged.set('weekday', '2');
		dragged.set('startTime', '09:00');

		expect(meta.metaPatchFromFormData(dragged)).toBeUndefined();
	});

	test('but a form that cleared its last pair says so explicitly', () => {
		// An empty `metaKey` is still present in the payload, and reads as `{}`.
		expect(meta.metaPatchFromFormData(form([['', '']]))).toBe('{}');

		const marked = new FormData();
		marked.set('metaPresent', '1');
		expect(meta.metaPatchFromFormData(marked)).toBe('{}');
	});

	test('and a form that submitted pairs patches them', () => {
		expect(JSON.parse(meta.metaPatchFromFormData(form([['room', 'B12']]))!)).toEqual({
			room: 'B12'
		});
	});
});
