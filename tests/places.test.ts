/**
 * Places: the tree that makes shopping an inventory.
 *
 * The rules that hold it together: a place cannot be moved inside itself or
 * its own descendants (a house is not a Klein bottle); deleting a place lets
 * its children rise rather than vanish, and the things in it become
 * place-less rather than deleted; the path reads root-down, the way a person
 * answers "where is it"; and an item's free fields survive the round trip.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let placesSvc: typeof import('../src/lib/server/services/places');
let shopping: typeof import('../src/lib/server/services/shopping');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	placesSvc = await import('../src/lib/server/services/places');
	shopping = await import('../src/lib/server/services/shopping');
	ctx = { userId: OWNER, now: new Date('2026-09-06T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('the tree', () => {
	test('nests as deep as a house does, and the path reads root-down', () => {
		const living = placesSvc.createPlace(ctx, { name: 'Living room' });
		const chest = placesSvc.createPlace(ctx, { name: 'White chest', parentId: living });
		const drawer = placesSvc.createPlace(ctx, { name: 'First drawer', parentId: chest });

		expect(placesSvc.pathOf(ctx, drawer)).toEqual(['Living room', 'White chest', 'First drawer']);

		const tree = placesSvc.placeTree(ctx);
		const room = tree.find((n) => n.name === 'Living room')!;
		expect(room.children[0].name).toBe('White chest');
		expect(room.children[0].children[0].name).toBe('First drawer');
	});

	test('a place cannot be moved inside itself or its own descendants', () => {
		const a = placesSvc.createPlace(ctx, { name: 'Garage' });
		const b = placesSvc.createPlace(ctx, { name: 'Shelf', parentId: a });
		expect(() => placesSvc.updatePlace(ctx, a, { name: 'Garage', parentId: a })).toThrow();
		expect(() => placesSvc.updatePlace(ctx, a, { name: 'Garage', parentId: b })).toThrow();
	});

	test('deleting a place lets its children rise, not vanish', () => {
		const office = placesSvc.createPlace(ctx, { name: 'Office' });
		const desk = placesSvc.createPlace(ctx, { name: 'Desk', parentId: office });
		const drawer = placesSvc.createPlace(ctx, { name: 'Desk drawer', parentId: desk });

		placesSvc.deletePlace(ctx, desk);
		// The drawer now hangs where the desk did: under the office.
		expect(placesSvc.getPlace(ctx, drawer).parentId).toBe(office);
	});
});

describe('things living in places', () => {
	test('an item takes a place, and the count shows on the tree', () => {
		const kitchen = placesSvc.createPlace(ctx, { name: 'Kitchen' });
		shopping.createItem(ctx, { name: 'measuring tape', type: 'someday' });
		const item = shopping.listItems(ctx).find((i) => i.name === 'measuring tape')!;

		shopping.setItemPlace(ctx, item.id, kitchen);
		expect(shopping.listItems(ctx).find((i) => i.id === item.id)!.placeId).toBe(kitchen);
		expect(placesSvc.placeTree(ctx).find((n) => n.name === 'Kitchen')!.itemCount).toBe(1);

		// And out again — the inverse.
		shopping.setItemPlace(ctx, item.id, null);
		expect(shopping.listItems(ctx).find((i) => i.id === item.id)!.placeId).toBeNull();
	});

	test('a deleted place leaves its items place-less, never deleted', () => {
		const attic = placesSvc.createPlace(ctx, { name: 'Attic' });
		shopping.createItem(ctx, { name: 'old lamp', type: 'someday' });
		const lamp = shopping.listItems(ctx).find((i) => i.name === 'old lamp')!;
		shopping.setItemPlace(ctx, lamp.id, attic);

		placesSvc.deletePlace(ctx, attic);
		const after = shopping.listItems(ctx).find((i) => i.id === lamp.id)!;
		expect(after.placeId).toBeNull(); // still here, just homeless
	});

	test('free fields: not every object has the same shape', () => {
		shopping.createItem(ctx, { name: 'usb cable', type: 'someday' });
		const cable = shopping.listItems(ctx).find((i) => i.name === 'usb cable')!;

		shopping.setItemAttributes(ctx, cable.id, { plug: 'USB-C', speed: 'USB3' });
		const stored = shopping.listItems(ctx).find((i) => i.id === cable.id)!;
		expect(JSON.parse(stored.attributes)).toEqual({ plug: 'USB-C', speed: 'USB3' });

		// Replaced wholesale — removing a field is writing the rest.
		shopping.setItemAttributes(ctx, cable.id, { plug: 'USB-C' });
		expect(JSON.parse(shopping.listItems(ctx).find((i) => i.id === cable.id)!.attributes)).toEqual({
			plug: 'USB-C'
		});
	});
});

describe('one account cannot reach another’s', () => {
	test('places, placements and paths are all fenced', () => {
		const mine = placesSvc.createPlace(ctx, { name: 'Private room' });
		expect(() => placesSvc.getPlace(theirs, mine)).toThrow();
		expect(() => placesSvc.updatePlace(theirs, mine, { name: 'x' })).toThrow();
		expect(() => placesSvc.deletePlace(theirs, mine)).toThrow();
		expect(() => placesSvc.createPlace(theirs, { name: 'Sub', parentId: mine })).toThrow();
		expect(placesSvc.listPlaces(theirs).some((p) => p.id === mine)).toBe(false);
	});
});
