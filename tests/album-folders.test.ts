/**
 * An album holds what is inside it.
 *
 * A folder import writes `Birds` and `Birds — Passeriformes`, and the parent
 * itself holds nothing at all — every photograph is one level down. So an
 * album page shows the folders directly inside it and every picture beneath
 * it, and the card on the index counts the same thing it opens onto. Before
 * that, a card said 28 and opened onto a white page.
 *
 * Its own file rather than more cases in `gallery.test.ts`: that one pins the
 * album limit at three on purpose, to test the limit, and a tree needs more
 * albums than that.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
const configDir = mkdtempSync(join(tmpdir(), 'ontoplano-album-folders-config-'));
afterAll(() => database.remove());

let gallery: typeof import('../src/lib/services/gallery');
let ctx: { userId: string; now: Date; tz: string };

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
		'[media]\nmax_kilobytes = "500"\ngallery_albums = "50"\nalbum_images = "20"\n'
	);
	gallery = await import('../src/lib/services/gallery');
	ctx = { userId: OWNER, now: new Date('2026-09-11T12:00:00Z'), tz: 'UTC' };
});

describe('the folders inside an album', () => {
	test('a parent shows its folders and every picture under it', async () => {
		const root = gallery.createAlbum(ctx, { name: 'Woods' });
		const owls = gallery.createAlbum(ctx, { name: 'Woods — Owls' });
		const barn = gallery.createAlbum(ctx, { name: 'Woods — Owls — Barn' });

		const one = await gallery.uploadToAlbum(ctx, owls.id, {
			bytes: png([9, 1, 1]),
			filename: 'a.png'
		});
		const two = await gallery.uploadToAlbum(ctx, barn.id, {
			bytes: png([9, 2, 2]),
			filename: 'b.png'
		});

		// The album itself holds none of its own...
		expect(gallery.albumPictures(ctx, root.id)).toHaveLength(0);
		// ...and the page shows both anyway.
		expect(
			gallery
				.albumPicturesDeep(ctx, root.id)
				.map((p) => p.id)
				.sort()
		).toEqual([one, two].sort());

		// One folder directly inside, not two: Barn is inside Owls.
		expect(gallery.albumsInside(ctx, root.id).direct.map((a) => a.name)).toEqual(['Woods — Owls']);
		expect(gallery.albumsInside(ctx, root.id).beneath).toHaveLength(2);
	});

	test('a folder with no album between it and here still appears', () => {
		const root = gallery.createAlbum(ctx, { name: 'Trips 2024' });
		gallery.createAlbum(ctx, { name: 'Trips 2024 — Spain — Girona' });

		// Nothing named `Trips 2024 — Spain` exists, and Girona must not fall
		// into that gap.
		expect(gallery.albumsInside(ctx, root.id).direct.map((a) => a.name)).toEqual([
			'Trips 2024 — Spain — Girona'
		]);
	});

	test('a picture in two folders under the same parent is counted once', async () => {
		const root = gallery.createAlbum(ctx, { name: 'Garden' });
		const spring = gallery.createAlbum(ctx, { name: 'Garden — Spring' });
		const roses = gallery.createAlbum(ctx, { name: 'Garden — Roses' });

		const id = await gallery.uploadToAlbum(ctx, spring.id, {
			bytes: png([3, 3, 9]),
			filename: 'rose.png'
		});
		gallery.addToAlbum(ctx, roses.id, id);

		expect(gallery.albumPicturesDeep(ctx, root.id).map((p) => p.id)).toEqual([id]);
	});

	test('a parent with nothing of its own wears a cover from inside', async () => {
		gallery.createAlbum(ctx, { name: 'Coast' });
		const cliffs = gallery.createAlbum(ctx, { name: 'Coast — Cliffs' });
		const id = await gallery.uploadToAlbum(ctx, cliffs.id, {
			bytes: png([4, 5, 6]),
			filename: 'cliff.png'
		});

		const tree = gallery.albumTree(ctx);
		const coast = tree.find((node) => node.name === 'Coast')!;
		expect(coast.count).toBe(0);
		expect(coast.totalCount).toBe(1);
		// The card opens onto that picture, so it should look like it.
		expect(coast.coverId).toBe(id);
	});
});
