/**
 * The attributes an account has actually used.
 *
 * An attribute is not a row — it is a name somebody typed into an item's own
 * JSON — which is the point, and also the problem: a set with no table has
 * nowhere to keep a colour, nowhere to be renamed from, and no way to answer
 * "what values does this take" without reading every item. This is that
 * answer, and the three verbs a screen full of them needs.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let attributes: typeof import('../src/lib/services/attributes');
let inventory: typeof import('../src/lib/services/inventory');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

const idOf = (name: string) => inventory.listItems(ctx).find((i) => i.name === name)!.id;

beforeAll(async () => {
	attributes = await import('../src/lib/services/attributes');
	inventory = await import('../src/lib/services/inventory');
	ctx = { userId: OWNER, now: new Date('2026-09-18T12:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	for (const name of ['tape', 'cable', 'other cable']) {
		inventory.createItem(ctx, { name, type: 'someday' });
	}
	inventory.setItemAttributes(ctx, idOf('tape'), { length: '5m', kind: 'tailor' });
	inventory.setItemAttributes(ctx, idOf('cable'), { length: '2m', usb: '' });
	inventory.setItemAttributes(ctx, idOf('other cable'), { length: '2m' });

	// Somebody else's thing, which must never appear in any of this.
	inventory.createItem(theirs, { name: 'theirs', type: 'someday' });
	inventory.setItemAttributes(theirs, inventory.listItems(theirs)[0].id, { secret: 'yes' });
});

describe('what the things say about themselves', () => {
	test('is gathered, counted, and led by the one used most', () => {
		const all = attributes.listAttributes(ctx);
		expect(all.map((a) => a.key)).toEqual(['length', 'kind', 'usb']);

		const length = all[0];
		expect(length.count).toBe(3);
		expect(length.values).toEqual([
			{ value: '2m', count: 2, color: null },
			{ value: '5m', count: 1, color: null }
		]);
	});

	test('and holds nobody else’s', () => {
		expect(attributes.listAttributes(ctx).map((a) => a.key)).not.toContain('secret');
		expect(attributes.listAttributes(theirs).map((a) => a.key)).toEqual(['secret']);
	});

	/** An attribute with no value is a whole attribute — the bare word case. */
	test('counts a name with no value', () => {
		const usb = attributes.listAttributes(ctx).find((a) => a.key === 'usb')!;
		expect(usb.values).toEqual([{ value: '', count: 1, color: null }]);
	});
});

describe('renaming', () => {
	test('moves an attribute on every thing that has it', () => {
		attributes.renameAttribute(ctx, 'length', 'size');
		const all = attributes.listAttributes(ctx);
		expect(all.map((a) => a.key)).toContain('size');
		expect(all.map((a) => a.key)).not.toContain('length');
		expect(all.find((a) => a.key === 'size')!.count).toBe(3);
	});

	test('and one value of one, leaving the others alone', () => {
		attributes.renameAttributeValue(ctx, 'size', '2m', 'two metres');
		const size = attributes.listAttributes(ctx).find((a) => a.key === 'size')!;
		expect(size.values.map((v) => v.value).sort()).toEqual(['5m', 'two metres']);
	});

	/**
	 * A rename onto a name that exists is a merge, deliberately — that is what
	 * somebody fixing "Colour" against "colour" is asking for.
	 */
	test('onto a name that already exists merges into it', () => {
		attributes.renameAttribute(ctx, 'kind', 'size');
		const all = attributes.listAttributes(ctx);
		expect(all.map((a) => a.key)).not.toContain('kind');
		// The tape kept the size it already had rather than taking "tailor".
		const tape = inventory.listItems(ctx).find((i) => i.name === 'tape')!;
		expect(JSON.parse(tape.attributes)).toEqual({ size: '5m' });
	});
});

describe('a colour', () => {
	test('sits on the attribute, or on one of its values', () => {
		attributes.setAttributeColor(ctx, 'size', '', '#112233');
		attributes.setAttributeColor(ctx, 'size', '5m', '#445566');

		const size = attributes.listAttributes(ctx).find((a) => a.key === 'size')!;
		expect(size.color).toBe('#112233');
		expect(size.values.find((v) => v.value === '5m')!.color).toBe('#445566');
	});

	test('is taken off by setting nothing', () => {
		attributes.setAttributeColor(ctx, 'size', '5m', '');
		const size = attributes.listAttributes(ctx).find((a) => a.key === 'size')!;
		expect(size.values.find((v) => v.value === '5m')!.color).toBeNull();
	});

	/** It goes into an inline style, so it is checked rather than trusted. */
	test('refuses anything that is not a colour', () => {
		expect(() => attributes.setAttributeColor(ctx, 'size', '', 'red; content:')).toThrow();
	});

	test('follows the attribute when it is renamed', () => {
		attributes.renameAttribute(ctx, 'size', 'measurement');
		const found = attributes.listAttributes(ctx).find((a) => a.key === 'measurement')!;
		expect(found.color).toBe('#112233');
	});
});

describe('removing an attribute', () => {
	test('takes it off everything, and leaves the things alone', () => {
		attributes.removeAttribute(ctx, 'measurement');
		expect(attributes.listAttributes(ctx).map((a) => a.key)).toEqual(['usb']);
		expect(
			inventory
				.listItems(ctx)
				.map((i) => i.name)
				.sort()
		).toEqual(['cable', 'other cable', 'tape']);
	});
});
