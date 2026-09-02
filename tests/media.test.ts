import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * Pictures: what is accepted, what is refused, and whose they are.
 *
 * The interesting cases here are all refusals, because an upload endpoint is
 * one of the two or three places in an app where somebody else decides what
 * bytes arrive. Each of these is a specific thing that has gone wrong in
 * somebody else's app:
 *
 *  - a file typed `image/png` by the sender and executed as something else;
 *  - an SVG, which is a document that can carry script, served from the app's
 *    own origin;
 *  - a filename that steers the header it is echoed into;
 *  - a quota nobody enforced until the disk was full.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let media: typeof import('../src/lib/server/services/media');
let buildCtx: typeof import('../src/lib/server/services/ctx').buildCtx;
let recipes: typeof import('../src/lib/server/services/recipes');

const configDir = mkdtempSync(join(tmpdir(), 'ontoplano-media-config-'));

beforeAll(async () => {
	process.env.ONTOPLANO_CONFIG_DIR = configDir;
	media = await import('../src/lib/server/services/media');
	({ buildCtx } = await import('../src/lib/server/services/ctx'));
	recipes = await import('../src/lib/server/services/recipes');
});

const ctx = () => buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });
const other = () => buildCtx(STRANGER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });

/** A real PNG of one colour — the bytes a browser would actually send. */
function png(size = 8, colour: [number, number, number] = [1, 2, 3]): Buffer {
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
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const raw = Buffer.concat(
		Array.from({ length: size }, () =>
			Buffer.concat([
				Buffer.from([0]),
				Buffer.concat(Array.from({ length: size }, () => Buffer.from(colour)))
			])
		)
	);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const gif = () => Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(64, 7)]);
const webp = () =>
	Buffer.concat([
		Buffer.from('RIFF', 'latin1'),
		Buffer.alloc(4),
		Buffer.from('WEBP', 'latin1'),
		Buffer.alloc(64, 7)
	]);

/** Write a config file and load the service against it. */
function withLimits(toml: string) {
	writeFileSync(join(configDir, 'config.toml'), toml);
}

describe('what is accepted', () => {
	beforeEach(() => withLimits('[media]\nmax_kilobytes = "500"\nrecipe_images = "6"\n'));

	it('takes the four raster formats a browser draws inertly', () => {
		for (const [what, bytes] of [
			['png', png()],
			['jpeg', jpeg()],
			['gif', gif()],
			['webp', webp()]
		] as const) {
			const stored = media.store(ctx(), { bytes, filename: `a.${what}` });
			expect(stored.mime, what).toMatch(/^image\//);
		}
	});

	/**
	 * The type is the bytes, not the claim.
	 *
	 * Every one of these arrives named like a picture. None of them is one, and
	 * an app that believed the name would be serving them from its own origin.
	 */
	it('refuses anything that is not one of them, whatever it is called', () => {
		const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
		const html = Buffer.from('<!doctype html><script>alert(1)</script>');
		const pdf = Buffer.from('%PDF-1.4\n%…………………………');
		const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(64).fill(0)]);

		for (const [what, bytes] of [
			['svg', svg],
			['html', html],
			['pdf', pdf],
			['zip', zip]
		] as const)
			expect(() => media.store(ctx(), { bytes, filename: `nice.${what}.png` }), what).toThrow(
				/not a picture/i
			);
	});

	it('refuses an empty file', () => {
		expect(() => media.store(ctx(), { bytes: Buffer.alloc(0) })).toThrow(/empty/i);
	});

	it('refuses one over the instance’s ceiling, and says the number', () => {
		withLimits('[media]\nmax_kilobytes = "16"\n');
		const big = Buffer.concat([png(), Buffer.alloc(20 * 1024, 0)]);
		expect(() => media.store(ctx(), { bytes: big })).toThrow(/16KB/);
	});

	/**
	 * The filename is shown and echoed into a `Content-Disposition`, so nothing
	 * that could steer either survives it. It is never a path: the bytes are a
	 * column.
	 */
	it('strips a filename that could steer a header or a path', () => {
		const nasty = media.store(ctx(), {
			bytes: png(9),
			filename: '../../etc/passwd"; attachment; x="a.png'
		});
		expect(nasty.filename).not.toContain('..');
		expect(nasty.filename).not.toContain('/');
		expect(nasty.filename).not.toContain('"');
		expect(nasty.filename).not.toContain(';');
	});

	it('gives a nameless file a name of its own', () => {
		expect(media.store(ctx(), { bytes: png(10) }).filename).toMatch(/\.png$/);
	});

	it('stores the same picture once', () => {
		const first = media.store(ctx(), { bytes: png(11), filename: 'a.png' });
		const again = media.store(ctx(), { bytes: png(11), filename: 'b.png' });
		expect(again.id).toBe(first.id);
	});

	it('refuses to go over the account’s total', () => {
		withLimits('[media]\nmax_kilobytes = "500"\naccount_megabytes = "1"\n');

		// Real pictures, each a fifth of the allowance. Padded with noise rather
		// than colour: a solid PNG of any size deflates to nothing, and a test
		// that thinks it stored a megabyte would pass whatever the code did.
		const heavy = (n: number) => Buffer.concat([png(8, [n, 0, 0]), randomBytes(200 * 1024)]);

		expect(() => {
			for (let i = 0; i < 10; i++) media.store(ctx(), { bytes: heavy(i), filename: `${i}.png` });
		}).toThrow(/1MB/);
	});
});

describe('whose it is', () => {
	beforeEach(() => withLimits('[media]\nmax_kilobytes = "500"\n'));

	it('is not readable by anybody else, and not found rather than refused', () => {
		const mine = media.store(ctx(), { bytes: png(12), filename: 'mine.png' });
		expect(media.read(ctx(), mine.id).bytes.length).toBeGreaterThan(0);
		expect(() => media.read(other(), mine.id)).toThrow(/no such picture/i);
	});

	it('cannot be deleted by anybody else', () => {
		const mine = media.store(ctx(), { bytes: png(13), filename: 'mine.png' });
		expect(() => media.remove(other(), mine.id)).toThrow(/no such picture/i);
		// …and it is still there.
		expect(media.read(ctx(), mine.id).bytes.length).toBeGreaterThan(0);
	});

	it('cannot be attached to somebody else’s recipe', () => {
		const theirs = recipes.createRecipe(other(), { title: 'Not yours' });
		expect(() =>
			media.attachToRecipe(ctx(), theirs, { bytes: png(14), filename: 'x.png' })
		).toThrow(/no such recipe/i);
	});
});

describe('a recipe’s gallery', () => {
	beforeEach(() => withLimits('[media]\nmax_kilobytes = "500"\nrecipe_images = "3"\n'));

	it('makes the first one the main one without being asked', () => {
		const id = recipes.createRecipe(ctx(), { title: 'First' });
		const one = media.attachToRecipe(ctx(), id, { bytes: png(20, [1, 0, 0]), filename: '1.png' });
		expect(one.isMain).toBe(true);
	});

	it('has exactly one main, and moving it is a swap', () => {
		const id = recipes.createRecipe(ctx(), { title: 'Swap' });
		const a = media.attachToRecipe(ctx(), id, { bytes: png(21, [1, 0, 0]), filename: 'a.png' });
		const b = media.attachToRecipe(ctx(), id, { bytes: png(21, [2, 0, 0]), filename: 'b.png' });

		media.setMain(ctx(), id, b.id);
		const after = media.picturesOf(ctx(), id);
		expect(after.filter((p) => p.isMain).map((p) => p.id)).toEqual([b.id]);
		expect(after.find((p) => p.id === a.id)?.isMain).toBe(false);
	});

	it('keeps a main one when the main one is removed', () => {
		const id = recipes.createRecipe(ctx(), { title: 'Removed' });
		const a = media.attachToRecipe(ctx(), id, { bytes: png(22, [1, 0, 0]), filename: 'a.png' });
		media.attachToRecipe(ctx(), id, { bytes: png(22, [2, 0, 0]), filename: 'b.png' });

		media.detachFromRecipe(ctx(), id, a.id);
		const left = media.picturesOf(ctx(), id);
		expect(left).toHaveLength(1);
		expect(left[0].isMain).toBe(true);
	});

	it('refuses more than the instance allows', () => {
		const id = recipes.createRecipe(ctx(), { title: 'Full' });
		for (let i = 0; i < 3; i++)
			media.attachToRecipe(ctx(), id, { bytes: png(23, [i, 0, 0]), filename: `${i}.png` });

		expect(() =>
			media.attachToRecipe(ctx(), id, { bytes: png(23, [9, 0, 0]), filename: 'x.png' })
		).toThrow(/at most 3/);
	});

	/**
	 * Taking a picture off a recipe takes the bytes with it — unless something
	 * else still names it. Otherwise every removed picture is storage nobody can
	 * see and nobody can reclaim.
	 */
	it('drops the bytes when nothing else wants them', () => {
		const id = recipes.createRecipe(ctx(), { title: 'Orphan' });
		const only = media.attachToRecipe(ctx(), id, { bytes: png(24), filename: 'only.png' });

		media.detachFromRecipe(ctx(), id, only.id);
		expect(() => media.read(ctx(), only.id)).toThrow(/no such picture/i);
	});

	it('keeps them when somebody’s writing still mentions it', async () => {
		const diary = await import('../src/lib/server/services/diary');
		const id = recipes.createRecipe(ctx(), { title: 'Mentioned' });
		const shared = media.attachToRecipe(ctx(), id, { bytes: png(25), filename: 'shared.png' });
		diary.createEntry(ctx(), { content: `Made it again ![it](/media/${shared.id})` });

		media.detachFromRecipe(ctx(), id, shared.id);
		expect(media.read(ctx(), shared.id).bytes.length).toBeGreaterThan(0);
	});
});

describe('pictures inside writing', () => {
	it('counts the ones an entry actually mentions', () => {
		const content = 'a ![one](/media/1) b ![two](/media/2) and ![again](/media/1)';
		expect(media.referencedIn(content).sort()).toEqual([1, 2]);
	});

	it('does not count a link that only looks like one', () => {
		expect(media.referencedIn('[not a picture](/media/9)')).toEqual([]);
		expect(media.referencedIn('![elsewhere](https://example.com/a.png)')).toEqual([]);
	});

	it('refuses an entry over the instance’s per-entry ceiling', () => {
		withLimits('[media]\nentry_images = "2"\n');
		const three = [1, 2, 3].map((n) => `![p](/media/${n})`).join('\n');
		expect(() => media.assertEntryWithinLimit(three)).toThrow(/at most 2/);
		expect(() => media.assertEntryWithinLimit('![p](/media/1)')).not.toThrow();
	});
});

/**
 * A picture leaves with the export and comes back.
 *
 * The promise this app makes is that the data is yours and one click takes it
 * away, so a picture that survives everything except the export is a picture
 * you lose the day you leave. Bytes are not something JSON holds, and the first
 * version of this dropped them silently — the round trip inserted a row with no
 * bytes in it and the database refused, which is the *good* outcome; a nullable
 * column would have carried an empty picture back with a straight face.
 */
describe('leaving with them', () => {
	it('carries the bytes out and in again, unchanged', async () => {
		const account = await import('../src/lib/server/services/account');
		const accountImport = await import('../src/lib/server/services/account-import');

		withLimits('[media]\nmax_kilobytes = "500"\n');
		const bytes = png(30, [7, 8, 9]);
		const stored = media.store(ctx(), { bytes, filename: 'leaving.png' });

		const file = account.exportAccount(OWNER, new Date('2026-04-01T10:00:00Z'));
		// A plain JSON file: it has to survive being written to disk and read back.
		const onDisk = JSON.parse(JSON.stringify(file));
		const row = (onDisk.data.media as { filename: string; bytes: string }[]).find(
			(m) => m.filename === 'leaving.png'
		);
		expect(row, 'the picture is in the export').toBeTruthy();
		expect(typeof row!.bytes, 'as a string, not as an object of byte numbers').toBe('string');

		accountImport.importAccount(STRANGER, onDisk);

		const theirs = media.list(other()).find((p) => p.filename === 'leaving.png');
		expect(theirs, 'the picture arrived').toBeTruthy();
		expect(media.read(other(), theirs!.id).bytes.equals(bytes), 'byte for byte').toBe(true);
		// And the original is untouched.
		expect(media.read(ctx(), stored.id).bytes.equals(bytes)).toBe(true);
	});
});

/**
 * One picture per person, and it lets go of the old one.
 *
 * SQLite cannot attach an `ON DELETE` action to a column added by
 * `ALTER TABLE`, so the constraint on `people.picture_id` is the default one —
 * it would *refuse* to delete a picture somebody's face still points at. The
 * service nulls the column itself, which is also where the decision belongs:
 * whether the bytes go depends on whether anything else still wants them.
 */
describe('a person’s face', () => {
	it('replaces the old one and does not leave it behind', async () => {
		const people = await import('../src/lib/server/services/people');
		withLimits('[media]\nmax_kilobytes = "500"\n');

		const person = people.createPerson(ctx(), { name: 'Ana' });
		const first = media.setPersonPicture(ctx(), person, {
			bytes: png(40, [1, 0, 0]),
			filename: 'ana.png'
		});
		const second = media.setPersonPicture(ctx(), person, {
			bytes: png(40, [2, 0, 0]),
			filename: 'ana2.png'
		});

		expect(second.id).not.toBe(first.id);
		// The one it replaced is gone, because nothing else was using it.
		expect(() => media.read(ctx(), first.id)).toThrow(/no such picture/i);
		expect(media.read(ctx(), second.id).bytes.length).toBeGreaterThan(0);
		expect(people.listPeople(ctx()).find((p) => p.id === person)?.pictureId).toBe(second.id);
	});

	it('lets go of the bytes when the face is removed', async () => {
		const people = await import('../src/lib/server/services/people');
		const person = people.createPerson(ctx(), { name: 'Bea' });
		const face = media.setPersonPicture(ctx(), person, {
			bytes: png(41),
			filename: 'bea.png'
		});

		media.removePersonPicture(ctx(), person);
		expect(people.listPeople(ctx()).find((p) => p.id === person)?.pictureId).toBeNull();
		expect(() => media.read(ctx(), face.id)).toThrow(/no such picture/i);
	});

	it('keeps a face that a recipe is also using', async () => {
		const people = await import('../src/lib/server/services/people');
		const person = people.createPerson(ctx(), { name: 'Cec' });
		const shared = media.setPersonPicture(ctx(), person, {
			bytes: png(42),
			filename: 'shared.png'
		});
		const recipe = recipes.createRecipe(ctx(), { title: 'Hers' });
		media.attachToRecipe(ctx(), recipe, { bytes: png(42), filename: 'same.png' });

		media.removePersonPicture(ctx(), person);
		expect(media.read(ctx(), shared.id).bytes.length).toBeGreaterThan(0);
	});

	it('is not somebody else’s to set', async () => {
		const people = await import('../src/lib/server/services/people');
		const mine = people.createPerson(ctx(), { name: 'Mine' });
		expect(() =>
			media.setPersonPicture(other(), mine, { bytes: png(43), filename: 'x.png' })
		).toThrow(/no such person/i);
	});
});
