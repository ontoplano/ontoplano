/**
 * Albums are lists of references over one media table.
 *
 * "Duplicating" a picture into a second album adds a membership row and no
 * bytes; removing it from one album leaves the other untouched; removing its
 * last reference anywhere deletes the picture, so no invisible bytes linger.
 * The limits are the instance's, tags ride the shared tags table without
 * being eaten by the diary's cleanup, and none of it is reachable from
 * another account.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
const configDir = mkdtempSync(join(tmpdir(), 'ontoplano-gallery-config-'));
afterAll(() => database.remove());

let gallery: typeof import('../src/lib/server/services/gallery');
let media: typeof import('../src/lib/server/services/media');
let tags: typeof import('../src/lib/services/tags');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

function png(colour: [number, number, number] = [1, 2, 3]): Buffer {
	const table = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buf: Buffer) => {
		let c = 0xffffffff;
		for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const check = Buffer.alloc(4);
		check.writeUInt32BE(crc(body));
		return Buffer.concat([length, body, check]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(1, 0);
	header.writeUInt32BE(1, 4);
	header[8] = 8;
	header[9] = 2;
	const pixel = deflateSync(Buffer.from([0, ...colour]));
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', pixel),
		chunk('IEND', Buffer.alloc(0))
	]);
}

beforeAll(async () => {
	process.env.ONTOPLANO_CONFIG_DIR = configDir;
	writeFileSync(
		join(configDir, 'config.toml'),
		'[media]\nmax_kilobytes = "500"\ngallery_albums = "3"\nalbum_images = "4"\n'
	);
	gallery = await import('../src/lib/server/services/gallery');
	media = await import('../src/lib/server/services/media');
	tags = await import('../src/lib/services/tags');
	ctx = { userId: OWNER, now: new Date('2026-09-11T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('albums', () => {
	test('a picture in two albums is one picture and two rows', () => {
		const trips = gallery.createAlbum(ctx, { name: 'Trips' });
		const best = gallery.createAlbum(ctx, { name: 'Best of' });
		const id = gallery.uploadToAlbum(ctx, trips.id, { bytes: png(), filename: 'sea.png' });

		gallery.addToAlbum(ctx, best.id, id);
		expect(gallery.albumPictures(ctx, trips.id).map((p) => p.id)).toEqual([id]);
		expect(gallery.albumPictures(ctx, best.id).map((p) => p.id)).toEqual([id]);
		// One media row: the same bytes uploaded again into the other album
		// dedup to the same picture rather than doubling the storage.
		expect(gallery.uploadToAlbum(ctx, best.id, { bytes: png(), filename: 'sea.png' })).toBe(id);
		expect(media.list(ctx)).toHaveLength(1);
		// "Also in" names both homes.
		expect(
			gallery
				.albumPictures(ctx, trips.id)[0]
				.albums.map((a) => a.name)
				.sort()
		).toEqual(['Best of', 'Trips']);
	});

	test('removed from one album it stays in the other; removed from the last it is gone', () => {
		const [trips, best] = gallery.listAlbums(ctx);
		const id = gallery.albumPictures(ctx, trips.id)[0].id;

		gallery.removeFromAlbum(ctx, trips.id, id);
		expect(gallery.albumPictures(ctx, best.id).map((p) => p.id)).toEqual([id]);
		expect(media.list(ctx)).toHaveLength(1);

		gallery.removeFromAlbum(ctx, best.id, id);
		expect(media.list(ctx)).toHaveLength(0);
	});

	test('deleting an album takes its only-here pictures with it and spares the shared ones', () => {
		const [trips, best] = gallery.listAlbums(ctx);
		const shared = gallery.uploadToAlbum(ctx, trips.id, { bytes: png([9, 9, 9]) });
		const only = gallery.uploadToAlbum(ctx, trips.id, { bytes: png([7, 7, 7]) });
		gallery.addToAlbum(ctx, best.id, shared);

		gallery.deleteAlbum(ctx, trips.id);
		const kept = media.list(ctx).map((p) => p.id);
		expect(kept).toContain(shared);
		expect(kept).not.toContain(only);
	});

	test('the instance names its ceilings', () => {
		gallery.createAlbum(ctx, { name: 'Two' });
		gallery.createAlbum(ctx, { name: 'Three' });
		expect(() => gallery.createAlbum(ctx, { name: 'Four' })).toThrow(/at most 3 albums/);

		const room = gallery.listAlbums(ctx).find((a) => a.name === 'Two')!;
		for (let i = 0; i < 3; i++) gallery.uploadToAlbum(ctx, room.id, { bytes: png([10 + i, 0, 0]) });
		// The shared picture from the earlier test still counts toward its album,
		// not this one; the fourth here fills it, the fifth is refused.
		gallery.uploadToAlbum(ctx, room.id, { bytes: png([20, 0, 0]) });
		expect(() => gallery.uploadToAlbum(ctx, room.id, { bytes: png([21, 0, 0]) })).toThrow(
			/at most 4 pictures/
		);
	});

	test('tags ride the shared table and survive the diary cleanup', () => {
		const room = gallery.listAlbums(ctx).find((a) => a.name === 'Two')!;
		const id = gallery.albumPictures(ctx, room.id)[0].id;
		gallery.tagPicture(ctx, id, 'beach, family');
		expect(gallery.albumPictures(ctx, room.id).find((p) => p.id === id)?.tags).toEqual([
			'beach',
			'family'
		]);

		// The cleanup that trims tags nothing references must count pictures as
		// references, or saving a diary entry would eat the gallery's tags.
		tags.cleanupOrphanTags(ctx.userId);
		expect(gallery.albumPictures(ctx, room.id).find((p) => p.id === id)?.tags).toEqual([
			'beach',
			'family'
		]);

		gallery.tagPicture(ctx, id, '');
		expect(gallery.albumPictures(ctx, room.id).find((p) => p.id === id)?.tags).toEqual([]);
	});

	test('tags read the way diary tags read: spaces, commas, #-prefixes, case', () => {
		const room = gallery.listAlbums(ctx).find((a) => a.name === 'Two')!;
		const id = gallery.albumPictures(ctx, room.id)[0].id;
		gallery.tagPicture(ctx, id, '#Beach  family, beach');
		expect(gallery.albumPictures(ctx, room.id).find((p) => p.id === id)?.tags).toEqual([
			'beach',
			'family'
		]);
		gallery.tagPicture(ctx, id, '');
	});

	test('a picture can be renamed, and only by its owner', () => {
		const room = gallery.listAlbums(ctx).find((a) => a.name === 'Two')!;
		const id = gallery.albumPictures(ctx, room.id)[0].id;
		gallery.renamePicture(ctx, id, { name: 'the good one' });
		expect(gallery.albumPictures(ctx, room.id).find((p) => p.id === id)?.filename).toBe(
			'the good one'
		);
		expect(() => gallery.renamePicture(theirs, id, { name: 'not yours' })).toThrow();
	});

	test('a folder becomes albums, and its subfolders become their own', () => {
		// The ceilings test above deliberately fills this instance; a folder
		// import needs room, and the limits are the instance's to set.
		writeFileSync(
			join(configDir, 'config.toml'),
			'[media]\nmax_kilobytes = "500"\ngallery_albums = "50"\nalbum_images = "50"\n'
		);

		const result = gallery.importFolder(ctx, [
			{ path: 'birds/kingfisher.jpg', filename: 'kingfisher.jpg', bytes: png([30, 1, 1]) },
			{ path: 'birds/herons/dawn.jpg', filename: 'dawn.jpg', bytes: png([31, 1, 1]) },
			{ path: 'birds/herons/dusk.jpg', filename: 'dusk.jpg', bytes: png([32, 1, 1]) }
		]);
		expect(result).toEqual({ albums: 2, pictures: 3, skipped: 0 });

		const names = gallery.listAlbums(ctx).map((a) => a.name);
		expect(names).toContain('birds');
		expect(names).toContain('birds — herons');

		const herons = gallery.listAlbums(ctx).find((a) => a.name === 'birds — herons')!;
		expect(herons.count).toBe(2);
	});

	test('the same tree twice costs its bytes once', () => {
		const before = media.list(ctx).length;
		gallery.importFolder(ctx, [
			{ path: 'birds/kingfisher.jpg', filename: 'kingfisher.jpg', bytes: png([30, 1, 1]) }
		]);
		// Same bytes, same picture, same album: nothing new anywhere.
		expect(media.list(ctx)).toHaveLength(before);
		expect(gallery.listAlbums(ctx).find((a) => a.name === 'birds')!.count).toBe(1);
	});

	test('the plan says what would land and what would not, and why', () => {
		writeFileSync(
			join(configDir, 'config.toml'),
			'[media]\nmax_kilobytes = "16"\ngallery_albums = "50"\nalbum_images = "50"\n'
		);

		const plan = gallery.planFolder(ctx, [
			{ path: 'birds/small.jpg', bytes: 4 * 1024 },
			{ path: 'birds/herons/huge.jpg', bytes: 900 * 1024 },
			{ path: 'birds/empty.jpg', bytes: 0 }
		]);

		expect(plan.willImport).toBe(1);
		expect(plan.willRefuse).toBe(2);
		expect(plan.maxKilobytes).toBe(16);
		// The album an accepted file would land in, named before it lands.
		expect(plan.files[0]).toMatchObject({ album: 'birds', ok: true });
		// And the refusals say the number somebody can act on.
		expect(plan.files[1].refusedBecause).toMatch(/at most 16KB, and that one is 900KB/);
		expect(plan.files[2].refusedBecause).toMatch(/empty/);
		// An album nothing would land in is not counted as one about to exist.
		expect(plan.albums).toEqual(['birds']);

		writeFileSync(
			join(configDir, 'config.toml'),
			'[media]\nmax_kilobytes = "500"\ngallery_albums = "50"\nalbum_images = "50"\n'
		);
	});

	test('a folder can be filed under a name of its own', () => {
		gallery.importFolder(
			ctx,
			[{ path: 'gulls/one.jpg', filename: 'one.jpg', bytes: png([40, 2, 2]) }],
			{ under: '2026' }
		);
		expect(gallery.listAlbums(ctx).map((a) => a.name)).toContain('2026 — gulls');
	});

	test('albums that belong to each other read as a tree', () => {
		// Its own name, so the albums the earlier tests made are not in the way.
		gallery.importFolder(ctx, [
			{ path: 'aves/kingfisher.jpg', filename: 'k.jpg', bytes: png([50, 1, 1]) },
			{ path: 'aves/Falconiformes/caracara.jpg', filename: 'c.jpg', bytes: png([51, 1, 1]) },
			{ path: 'aves/Falconiformes/small/chick.jpg', filename: 'ch.jpg', bytes: png([52, 1, 1]) }
		]);

		const tree = gallery.albumTree(ctx);
		const aves = tree.find((n) => n.name === 'aves')!;
		expect(aves.children.map((c) => c.name)).toContain('aves — Falconiformes');
		// Its own one, plus the two underneath — what somebody is looking at.
		expect(aves.totalCount).toBe(3);

		const falcons = aves.children.find((c) => c.name === 'aves — Falconiformes')!;
		expect(falcons.depth).toBe(1);
		expect(falcons.children.map((c) => c.name)).toEqual(['aves — Falconiformes — small']);
		// And nothing is listed twice: a child is under its parent and not
		// also at the top.
		expect(tree.map((n) => n.name)).not.toContain('aves — Falconiformes');
	});

	test('another account reaches none of it', () => {
		const room = gallery.listAlbums(ctx)[0];
		const id = gallery.albumPictures(ctx, room.id)[0].id;
		expect(gallery.listAlbums(theirs)).toHaveLength(0);
		expect(() => gallery.albumPictures(theirs, room.id)).toThrow();
		expect(() => gallery.addToAlbum(theirs, room.id, id)).toThrow();
		const strangersAlbum = gallery.createAlbum(theirs, { name: 'Mine' });
		expect(() => gallery.addToAlbum(theirs, strangersAlbum.id, id)).toThrow();
	});
});
