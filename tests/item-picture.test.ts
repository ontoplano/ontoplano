/**
 * A thing in the inventory can have a picture.
 *
 * The same arrangement a face has: one picture, set in one gesture, the old
 * one let go of when nothing else shows it — and the picture belongs to the
 * thing, so the inventory grant reaches it and the unused list leaves it be.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let media: typeof import('../src/lib/services/media');
let inventory: typeof import('../src/lib/services/inventory');
let referrers: typeof import('../src/lib/services/media-referrers');
let unused: typeof import('../src/lib/services/unused-media');
const ctx = { userId: OWNER, now: new Date('2026-10-03T09:00:00Z'), tz: 'UTC' };
const theirs = { ...ctx, userId: STRANGER };

let shade = 0;
const png = () =>
	Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, ++shade)]);

beforeAll(async () => {
	media = await import('../src/lib/services/media');
	inventory = await import('../src/lib/services/inventory');
	referrers = await import('../src/lib/services/media-referrers');
	unused = await import('../src/lib/services/unused-media');
});

describe('a picture on a thing', () => {
	test('is set, listed with the thing, and counted as used', async () => {
		const { id } = inventory.createItem(ctx, { name: 'Tape measure', type: 'replenish' });
		const picture = await media.setItemPicture(ctx, id, { bytes: png() });

		expect(inventory.listItems(ctx).find((one) => one.id === id)?.pictureId).toBe(picture.id);
		expect(referrers.pictureReferrers(ctx, picture.id).map((one) => one.kind)).toEqual(['item']);
		expect(unused.unusedPictures(ctx).map((one) => one.id)).not.toContain(picture.id);
	});

	test('replaced, the old one goes; removed, so does that', async () => {
		const { id } = inventory.createItem(ctx, { name: 'Drill', type: 'replenish' });
		const first = await media.setItemPicture(ctx, id, { bytes: png() });
		const second = await media.setItemPicture(ctx, id, { bytes: png() });
		const kept = media.list(ctx).map((one) => one.id);
		expect(kept).not.toContain(first.id);
		expect(kept).toContain(second.id);

		media.removeItemPicture(ctx, id);
		expect(inventory.listItems(ctx).find((one) => one.id === id)?.pictureId).toBeNull();
		expect(media.list(ctx).map((one) => one.id)).not.toContain(second.id);
	});

	test('a stranger can neither set one nor take it off', async () => {
		const { id } = inventory.createItem(ctx, { name: 'Ladder', type: 'replenish' });
		await expect(media.setItemPicture(theirs, id, { bytes: png() })).rejects.toThrow();
		const mine = await media.setItemPicture(ctx, id, { bytes: png() });
		expect(() => media.removeItemPicture(theirs, id)).toThrow();
		expect(inventory.listItems(ctx).find((one) => one.id === id)?.pictureId).toBe(mine.id);
	});
});
