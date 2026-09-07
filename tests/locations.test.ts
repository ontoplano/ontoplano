/**
 * Locations: the tree that makes shopping an inventory.
 *
 * The rules that hold it together: a location cannot be moved inside itself or
 * its own descendants (a house is not a Klein bottle); deleting a location lets
 * its children rise rather than vanish, and the things in it become
 * location-less rather than deleted; the path reads root-down, the way a person
 * answers "where is it"; and an item's free fields survive the round trip.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let locationsSvc: typeof import('../src/lib/server/services/locations');
let shopping: typeof import('../src/lib/server/services/shopping');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	locationsSvc = await import('../src/lib/server/services/locations');
	shopping = await import('../src/lib/server/services/shopping');
	ctx = { userId: OWNER, now: new Date('2026-09-06T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('the tree', () => {
	test('nests as deep as a house does, and the path reads root-down', () => {
		const living = locationsSvc.createLocation(ctx, { name: 'Living room' });
		const chest = locationsSvc.createLocation(ctx, { name: 'White chest', parentId: living });
		const drawer = locationsSvc.createLocation(ctx, { name: 'First drawer', parentId: chest });

		expect(locationsSvc.pathOf(ctx, drawer)).toEqual([
			'Living room',
			'White chest',
			'First drawer'
		]);

		const tree = locationsSvc.locationTree(ctx);
		const room = tree.find((n) => n.name === 'Living room')!;
		expect(room.children[0].name).toBe('White chest');
		expect(room.children[0].children[0].name).toBe('First drawer');
	});

	test('a location cannot be moved inside itself or its own descendants', () => {
		const a = locationsSvc.createLocation(ctx, { name: 'Garage' });
		const b = locationsSvc.createLocation(ctx, { name: 'Shelf', parentId: a });
		expect(() => locationsSvc.updateLocation(ctx, a, { name: 'Garage', parentId: a })).toThrow();
		expect(() => locationsSvc.updateLocation(ctx, a, { name: 'Garage', parentId: b })).toThrow();
	});

	test('deleting a location lets its children rise, not vanish', () => {
		const office = locationsSvc.createLocation(ctx, { name: 'Office' });
		const desk = locationsSvc.createLocation(ctx, { name: 'Desk', parentId: office });
		const drawer = locationsSvc.createLocation(ctx, { name: 'Desk drawer', parentId: desk });

		locationsSvc.deleteLocation(ctx, desk);
		// The drawer now hangs where the desk did: under the office.
		expect(locationsSvc.getLocation(ctx, drawer).parentId).toBe(office);
	});
});

describe('things living in locations', () => {
	test('an item takes a location, and the count shows on the tree', () => {
		const kitchen = locationsSvc.createLocation(ctx, { name: 'Kitchen' });
		shopping.createItem(ctx, { name: 'measuring tape', type: 'someday' });
		const item = shopping.listItems(ctx).find((i) => i.name === 'measuring tape')!;

		shopping.setItemLocation(ctx, item.id, kitchen);
		expect(shopping.listItems(ctx).find((i) => i.id === item.id)!.locationId).toBe(kitchen);
		expect(locationsSvc.locationTree(ctx).find((n) => n.name === 'Kitchen')!.itemCount).toBe(1);

		// And out again — the inverse.
		shopping.setItemLocation(ctx, item.id, null);
		expect(shopping.listItems(ctx).find((i) => i.id === item.id)!.locationId).toBeNull();
	});

	test('a deleted location leaves its items location-less, never deleted', () => {
		const attic = locationsSvc.createLocation(ctx, { name: 'Attic' });
		shopping.createItem(ctx, { name: 'old lamp', type: 'someday' });
		const lamp = shopping.listItems(ctx).find((i) => i.name === 'old lamp')!;
		shopping.setItemLocation(ctx, lamp.id, attic);

		locationsSvc.deleteLocation(ctx, attic);
		const after = shopping.listItems(ctx).find((i) => i.id === lamp.id)!;
		expect(after.locationId).toBeNull(); // still here, just homeless
	});

	test('free fields: not every object has the same shape', () => {
		shopping.createItem(ctx, { name: 'usb cable', type: 'someday' });
		const cable = shopping.listItems(ctx).find((i) => i.name === 'usb cable')!;

		shopping.setItemAttributes(ctx, cable.id, { plug: 'USB-C', speed: 'USB3' });
		const stored = shopping.listItems(ctx).find((i) => i.id === cable.id)!;
		expect(JSON.parse(stored.attributes)).toEqual({ plug: 'USB-C', speed: 'USB3' });

		// Relocationd wholesale — removing a field is writing the rest.
		shopping.setItemAttributes(ctx, cable.id, { plug: 'USB-C' });
		expect(JSON.parse(shopping.listItems(ctx).find((i) => i.id === cable.id)!.attributes)).toEqual({
			plug: 'USB-C'
		});
	});
});

describe('one account cannot reach another’s', () => {
	test('locations, locationments and paths are all fenced', () => {
		const mine = locationsSvc.createLocation(ctx, { name: 'Private room' });
		expect(() => locationsSvc.getLocation(theirs, mine)).toThrow();
		expect(() => locationsSvc.updateLocation(theirs, mine, { name: 'x' })).toThrow();
		expect(() => locationsSvc.deleteLocation(theirs, mine)).toThrow();
		expect(() => locationsSvc.createLocation(theirs, { name: 'Sub', parentId: mine })).toThrow();
		expect(locationsSvc.listLocations(theirs).some((p) => p.id === mine)).toBe(false);
	});
});
