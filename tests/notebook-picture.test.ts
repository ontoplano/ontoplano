/**
 * A notebook wears one picture, the way a person wears a face.
 *
 * The same three questions as any other file this app keeps: that replacing one
 * does not leave the old bytes lying about, that removing it leaves the
 * notebook, and — the one that is easy to forget and silently breaks reading it
 * — that something *refers* to it. A file nothing refers to is reachable by
 * nobody and is swept, so a picture not reported as the notebook's would be
 * deleted out from under it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let media: typeof import('../src/lib/services/media');
let referrers: typeof import('../src/lib/services/media-referrers');
let notebooks: typeof import('../src/lib/services/notebooks');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let ctx: ReturnType<typeof buildCtx>;
let theirs: ReturnType<typeof buildCtx>;
let book = 0;

/** The smallest valid GIF there is, numbered so two of them are two rows. */
const GIF = [
	0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
	0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
	0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00
];
const gif = (n: number) => Uint8Array.from([...GIF, n, 0x3b]);

beforeAll(async () => {
	media = await import('../src/lib/services/media');
	referrers = await import('../src/lib/services/media-referrers');
	notebooks = await import('../src/lib/services/notebooks');
	({ buildCtx } = await import('../src/lib/services/ctx'));
	ctx = buildCtx(OWNER, { tz: 'UTC' });
	theirs = buildCtx(STRANGER, { tz: 'UTC' });
	book = notebooks.createNotebook(ctx, { title: 'The trip' });
});

const pictureOf = (id: number) => notebooks.getNotebook(ctx, id).pictureId;

describe('a notebook’s picture', () => {
	test('starts as nothing, and is what was put on it', async () => {
		expect(pictureOf(book)).toBeNull();

		const put = await media.setNotebookPicture(ctx, book, { bytes: gif(1), filename: 'a.gif' });
		expect(pictureOf(book)).toBe(put.id);
	});

	test('is referred to by the notebook, so nothing sweeps it away', async () => {
		const put = await media.setNotebookPicture(ctx, book, { bytes: gif(2), filename: 'b.gif' });
		expect(referrers.pictureReferrers(ctx, put.id)).toContainEqual({
			kind: 'notebook',
			id: book,
			notebookId: book
		});
	});

	test('replaces rather than accumulates, and the one it replaced is gone', async () => {
		const first = await media.setNotebookPicture(ctx, book, { bytes: gif(3), filename: 'c.gif' });
		const second = await media.setNotebookPicture(ctx, book, { bytes: gif(4), filename: 'd.gif' });

		expect(pictureOf(book)).toBe(second.id);
		// Nothing refers to the old one now, so it should not still be there.
		expect(referrers.pictureReferrers(ctx, first.id)).toEqual([]);
	});

	test('can be taken off, and the notebook stays', () => {
		media.removeNotebookPicture(ctx, book);
		expect(pictureOf(book)).toBeNull();
		expect(notebooks.getNotebook(ctx, book).title).toBe('The trip');
	});

	test('and taking off one that is not there is not an error', () => {
		expect(() => media.removeNotebookPicture(ctx, book)).not.toThrow();
	});

	test('belongs to its account and nobody else’s', async () => {
		await expect(
			media.setNotebookPicture(theirs, book, { bytes: gif(5), filename: 'e.gif' })
		).rejects.toThrow();
		expect(() => media.removeNotebookPicture(theirs, book)).toThrow();
	});
});
