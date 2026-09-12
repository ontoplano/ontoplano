/**
 * The pictures that are in notebooks, as a gallery album.
 *
 * Nothing records which notebook a picture belongs to: a note's markdown
 * points at `/media/12` and that is the only fact there is. So this album is
 * derived on every read, and these are the cases that derivation has to get
 * right — a picture named twice is one picture, a note that moves notebook
 * takes its pictures with it, a deleted picture stops being counted, and a
 * notebook inside a notebook is a folder inside a folder.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
const configDir = mkdtempSync(join(tmpdir(), 'ontoplano-notebook-media-config-'));
afterAll(() => database.remove());

let notebookMedia: typeof import('../src/lib/services/notebook-media');
let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');
let media: typeof import('../src/lib/services/media');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

/** A one-pixel PNG of whatever colour, so two pictures are two rows. */
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
	writeFileSync(join(configDir, 'config.toml'), '[media]\nmax_kilobytes = "500"\n');
	notebookMedia = await import('../src/lib/services/notebook-media');
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');
	media = await import('../src/lib/services/media');
	ctx = { userId: OWNER, now: new Date('2026-09-11T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

/**
 * A picture, and the markdown a note would carry for it.
 *
 * A colour per picture, because `store` dedups by hash: the same bytes twice
 * is one row, which is right for the app and useless for a test that needs
 * several distinct pictures.
 */
let shade = 0;
async function picture(name: string) {
	shade += 1;
	const stored = await media.store(ctx, {
		bytes: new Uint8Array(png([shade, shade * 2, shade * 3])),
		filename: name
	});
	return { id: stored.id, markdown: `![${name}](/media/${stored.id})` };
}

describe('which pictures a piece of writing points at', () => {
	test('finds every address, once each, whatever the syntax around it', () => {
		const found = notebookMedia.picturesMentionedIn(
			'![a](/media/7)\n\nand again <img src="/media/7">\n\n![b](/media/12)'
		);
		expect(found.sort((a, b) => a - b)).toEqual([7, 12]);
	});

	test('finds nothing in writing with no pictures in it', () => {
		expect(notebookMedia.picturesMentionedIn('Just words. /media is not an address.')).toEqual([]);
	});
});

describe('the notebooks album', () => {
	test('a notebook with pictures is a folder, and one inside it is a folder inside it', async () => {
		const kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen' });
		const tops = notebooks.createNotebook(ctx, { title: 'Kitchen — Countertops' });
		const shelf = await picture('shelf.gif');
		const granite = await picture('granite.gif');

		diary.createEntry(ctx, { content: `The shelf.\n\n${shelf.markdown}`, notebookId: kitchen });
		diary.createEntry(ctx, { content: `Granite.\n\n${granite.markdown}`, notebookId: tops });

		const top = notebookMedia.notebookMediaView(ctx, '');
		expect(top.folders.map((f) => f.name)).toEqual(['Kitchen']);
		// The album itself holds nothing — every picture is in some notebook —
		// and shows everything beneath it.
		expect(top.pictures.map((p) => p.id).sort()).toEqual([shelf.id, granite.id].sort());

		const inKitchen = notebookMedia.notebookMediaView(ctx, 'Kitchen');
		expect(inKitchen.folders.map((f) => f.leaf)).toEqual(['Countertops']);
		expect(inKitchen.pictures.map((p) => p.id).sort()).toEqual([shelf.id, granite.id].sort());
		expect(notebookMedia.notebookMediaView(ctx, 'Kitchen — Countertops').pictures).toHaveLength(1);
	});

	test('a folder counts what is inside it as well as its own', () => {
		const folders = notebookMedia.notebookMediaFolders(ctx);
		const kitchen = folders.find((f) => f.name === 'Kitchen')!;
		expect(kitchen.pictureIds).toHaveLength(1);
		expect(kitchen.totalCount).toBe(2);
	});

	test('the same picture in two notes of one notebook is one picture', async () => {
		const reading = notebooks.createNotebook(ctx, { title: 'Reading' });
		const cover = await picture('cover.gif');
		diary.createEntry(ctx, { content: cover.markdown, notebookId: reading });
		diary.createEntry(ctx, { content: `Again: ${cover.markdown}`, notebookId: reading });

		expect(notebookMedia.notebookMediaView(ctx, 'Reading').pictures.map((p) => p.id)).toEqual([
			cover.id
		]);
	});

	test('a notebook whose notes have no pictures is not a folder at all', () => {
		notebooks.createNotebook(ctx, { title: 'Empty' });
		expect(notebookMedia.notebookMediaFolders(ctx).map((f) => f.name)).not.toContain('Empty');
	});

	test('a note with no notebook is in the diary, not here', async () => {
		const loose = await picture('loose.gif');
		diary.createEntry(ctx, { content: loose.markdown });

		const every = notebookMedia.notebookMediaFolders(ctx).flatMap((f) => f.pictureIds);
		expect(every).not.toContain(loose.id);
	});

	test('a picture that has been deleted stops being counted', async () => {
		const trip = notebooks.createNotebook(ctx, { title: 'Trip' });
		const gone = await picture('gone.gif');
		diary.createEntry(ctx, { content: gone.markdown, notebookId: trip });
		expect(notebookMedia.notebookMediaView(ctx, 'Trip').pictures).toHaveLength(1);

		// The note still points at it; the picture is not there any more.
		media.remove(ctx, gone.id);
		expect(notebookMedia.notebookMediaFolders(ctx).map((f) => f.name)).not.toContain('Trip');
	});

	test('another account sees none of it', () => {
		expect(notebookMedia.notebookMediaFolders(theirs)).toEqual([]);
		expect(notebookMedia.notebookMediaCount(theirs)).toBe(0);
	});

	test('a notebook nobody has pictures in is a 404, not an empty page', () => {
		expect(() => notebookMedia.notebookMediaView(ctx, 'Nowhere')).toThrow();
	});
});
