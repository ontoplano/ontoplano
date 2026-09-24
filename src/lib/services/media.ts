/**
 * Pictures: what is accepted, where they go, and who may see one.
 *
 * Three rules do most of the work here, and each of them is a thing that goes
 * wrong in every other app that stores an upload.
 *
 * **The type comes from the bytes.** A browser's `Content-Type` is a claim by
 * whoever wrote the request, and a filename extension is a claim by whoever
 * named the file. Neither decides anything: the first bytes are read and
 * matched against a short allowlist, and a file that does not look like one of
 * those is refused. Nothing is ever stored under a name the sender chose.
 *
 * **SVG is not an image here.** It is a document that can carry script, served
 * from this app's own origin, which is same-origin script execution dressed up
 * as a picture. There is no configuration for it.
 *
 * **The ceilings are the instance's.** On a server `[media]` in `config.toml`
 * decides how big one picture may be, how many a recipe or an entry may carry,
 * and what one account's pictures may add up to; on a phone they are the
 * numbers in `media-limits.ts`. Either way they arrive through
 * `host.mediaLimits()` and are enforced here, in the service, rather than in a
 * form — a limit checked in a form is a limit the API does not have.
 *
 * Nothing here is the server's. The bytes are a column, the type comes from
 * reading them, and the hash is WebCrypto's — so the same file serves the
 * instance running on a phone, where there is no Node, no `Buffer` and no
 * config file. That is why `store` is asynchronous: `crypto.subtle` is the one
 * digest both worlds have.
 */
import { and, eq, like, or, sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import {
	albumMedia,
	diaryEntries,
	media,
	notebooks,
	people,
	recipeImages,
	recipes
} from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { sha256Hex } from './digest.js';
import { NotFoundError, ValidationError } from './errors.js';
import { host } from './host.js';
import type { MediaLimits } from './media-limits.js';
import { IMAGE_MIME_PREFIX } from './media-kind.js';
import { stamp } from './time.js';

/**
 * What a picture may be, and how its first bytes look.
 *
 * Raster formats a browser renders inertly, and nothing else. GIF is here
 * because an animation is a picture; SVG is not, and never will be.
 */
/** Do these bytes start with exactly this run of bytes? */
const starts = (b: Uint8Array, at: number, expected: number[]) =>
	expected.every((byte, i) => b[at + i] === byte);

/** The ASCII a run of bytes spells, for the formats whose marker is a word. */
const ascii = (b: Uint8Array, from: number, to: number) =>
	String.fromCharCode(...b.subarray(from, to));

const SIGNATURES: { mime: string; extension: string; matches: (b: Uint8Array) => boolean }[] = [
	{
		mime: 'image/jpeg',
		extension: 'jpg',
		matches: (b) => starts(b, 0, [0xff, 0xd8, 0xff])
	},
	{
		mime: 'image/png',
		extension: 'png',
		matches: (b) => starts(b, 0, [137, 80, 78, 71, 13, 10, 26, 10])
	},
	{
		mime: 'image/gif',
		extension: 'gif',
		matches: (b) => /^GIF8[79]a$/.test(ascii(b, 0, 6))
	},
	{
		mime: 'image/webp',
		extension: 'webp',
		matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP'
	}
];

/** The list a file input may advertise. Not a check — the check is the bytes. */
export const ACCEPTED_TYPES = SIGNATURES.map((s) => s.mime);

/**
 * The names those formats are usually given.
 *
 * Also not a check: a `.png` holding something else is refused by `sniff`
 * like anything else would be. It is here so that a preview of a folder can
 * say "that is not a picture" about the video sitting in it, rather than
 * promising to import it and then quietly not.
 */
export const ACCEPTED_EXTENSIONS = [...SIGNATURES.map((s) => s.extension), 'jpeg'];

export const MAX_ALT_LENGTH = 300;
export const MAX_FILENAME_LENGTH = 200;

export type Picture = {
	id: number;
	mime: string;
	filename: string;
	alt: string;
	byteSize: number;
	createdAt: string;
};

/**
 * What the operator currently allows. Read per call: the file can change.
 *
 * The per-picture ceiling is the *smaller* of what `config.toml` asks for and
 * what the server can actually receive — `BODY_SIZE_LIMIT` belongs to the Node
 * adapter and rejects a larger body before this app runs, with an answer no
 * page can read. One effective number, honestly reported: the pages quote it,
 * the browser refuses against it, and the service enforces it.
 */
/**
 * Only rows that are pictures.
 *
 * Recordings live in this table too — same question, same account storage —
 * and no surface that draws pictures may see one. See `media-kind.ts`.
 */
const isPicture = like(media.mime, `${IMAGE_MIME_PREFIX}%`);

export function mediaLimits(): MediaLimits {
	return host.mediaLimits();
}

/**
 * The filename, reduced to something safe to show and store.
 *
 * It is never a path here — the bytes are a column, not a file — but it is
 * echoed back into a `Content-Disposition` header and into markup, so anything
 * that could steer either is removed rather than escaped: no separators, no
 * control characters, no quotes.
 */
export function tidyFilename(raw: string): string {
	return (
		raw
			// Nothing path-shaped survives. It is never used as a path — the bytes
			// are a column — but a name that still looks like one invites somebody
			// to treat it as one later.
			.replace(/\.{2,}/g, '.')
			.replace(/[\\/]/g, ' ')
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f"';]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, MAX_FILENAME_LENGTH)
	);
}

/** What these bytes actually are, or nothing. */
export function sniff(bytes: Uint8Array): { mime: string; extension: string } | null {
	if (bytes.length < 12) return null;
	const hit = SIGNATURES.find((s) => s.matches(bytes));
	return hit ? { mime: hit.mime, extension: hit.extension } : null;
}

/** What this account's pictures already add up to. */
export function bytesStored(ctx: Ctx): number {
	const [row] = db
		.select({ total: sql<number>`coalesce(sum(${media.byteSize}), 0)` })
		.from(media)
		.where(eq(media.userId, ctx.userId))
		.all();
	return row?.total ?? 0;
}

/**
 * Take a picture in.
 *
 * The same bytes uploaded twice are one row: two entries that quote the same
 * screenshot should not cost twice, and the second upload returns the first
 * row rather than failing on the unique index.
 */
export async function store(
	ctx: Ctx,
	input: { bytes: Uint8Array; filename?: string; alt?: string }
): Promise<Picture> {
	const limits = mediaLimits();

	if (!input.bytes || input.bytes.length === 0)
		throw new ValidationError({ key: 'errors.media.thatFileWasEmpty' });
	if (input.bytes.length > limits.maxBytes)
		throw new ValidationError(
			`Pictures here are at most ${limits.maxKilobytes}KB, and that one is ${Math.ceil(
				input.bytes.length / 1024
			)}KB.`
		);

	const kind = sniff(input.bytes);
	if (!kind) throw new ValidationError({ key: 'errors.media.thatIsNotAPicture' });

	const sha256 = await sha256Hex(input.bytes);
	const existing = db
		.select()
		.from(media)
		.where(and(eq(media.userId, ctx.userId), eq(media.sha256, sha256)))
		.get();
	if (existing) return toPicture(existing);

	// The quota is checked against what is already there plus this one, and
	// only once we know this one is new — a re-upload of something already
	// stored costs nothing and should not be refused for being over.
	if (bytesStored(ctx) + input.bytes.length > limits.accountBytes)
		throw new ValidationError(
			`Your pictures would go over this instance's ${limits.accountMegabytes}MB. Delete some first.`
		);

	const filename = tidyFilename(input.filename ?? '') || `picture.${kind.extension}`;

	const row = db
		.insert(media)
		.values({
			userId: ctx.userId,
			mime: kind.mime,
			filename,
			alt: (input.alt ?? '').trim().slice(0, MAX_ALT_LENGTH),
			byteSize: input.bytes.length,
			// The column is typed as Node's Buffer; on a device the same bytes
			// are a plain Uint8Array, and SQLite stores a blob either way.
			bytes: input.bytes as Buffer,
			sha256,
			createdAt: stamp(ctx)
		})
		.returning()
		.get();

	return toPicture(row);
}

function toPicture(row: typeof media.$inferSelect): Picture {
	return {
		id: row.id,
		mime: row.mime,
		filename: row.filename,
		alt: row.alt,
		byteSize: row.byteSize,
		createdAt: row.createdAt
	};
}

/**
 * The bytes, for the one account they belong to.
 *
 * Scoped in the `WHERE`, so somebody else's id is a 404 rather than a picture:
 * not found and not yours are the same answer.
 */
export function read(ctx: Ctx, id: number): { mime: string; filename: string; bytes: Uint8Array } {
	const row = db
		.select()
		.from(media)
		.where(and(eq(media.id, id), eq(media.userId, ctx.userId), isPicture))
		.get();
	if (!row) throw new NotFoundError({ key: 'errors.media.noSuchPicture' });
	return { mime: row.mime, filename: row.filename, bytes: new Uint8Array(row.bytes) };
}

export function list(ctx: Ctx): Picture[] {
	return db
		.select()
		.from(media)
		.where(and(eq(media.userId, ctx.userId), isPicture))
		.all()
		.map(toPicture);
}

/**
 * Is anything still pointing at this picture?
 *
 * Two kinds of reference exist and both are checked: a recipe's gallery, which
 * is a row, and a mention inside somebody's writing, which is the string
 * `/media/<id>` in the text. The `LIKE` is bounded by the characters that can
 * follow an id, so `/media/1` does not count `/media/17` as a reference to it.
 */
export function isReferenced(ctx: Ctx, id: number): boolean {
	const inAlbum = db
		.select({ id: albumMedia.id })
		.from(albumMedia)
		.where(and(eq(albumMedia.userId, ctx.userId), eq(albumMedia.mediaId, id)))
		.get();
	if (inAlbum) return true;

	const isAFace = db
		.select({ id: people.id })
		.from(people)
		.where(and(eq(people.userId, ctx.userId), eq(people.pictureId, id)))
		.get();
	if (isAFace) return true;

	const inRecipe = db
		.select({ id: recipeImages.id })
		.from(recipeImages)
		.where(and(eq(recipeImages.userId, ctx.userId), eq(recipeImages.mediaId, id)))
		.get();
	if (inRecipe) return true;

	const written = db
		.select({ id: diaryEntries.id })
		.from(diaryEntries)
		.where(
			and(
				eq(diaryEntries.userId, ctx.userId),
				or(
					like(diaryEntries.content, `%(/media/${id})%`),
					like(diaryEntries.content, `%/media/${id} %`),
					like(diaryEntries.content, `%/media/${id}`)
				)
			)
		)
		.get();
	return Boolean(written);
}

/** Remove a picture outright. */
export function remove(ctx: Ctx, id: number): void {
	const gone = db
		.delete(media)
		.where(and(eq(media.id, id), eq(media.userId, ctx.userId)))
		.run();
	if (gone.changes === 0) throw new NotFoundError({ key: 'errors.media.noSuchPicture' });
}

/** Remove it only if nothing points at it any more. Returns whether it went. */
export function removeIfUnreferenced(ctx: Ctx, id: number): boolean {
	if (isReferenced(ctx, id)) return false;
	const gone = db
		.delete(media)
		.where(and(eq(media.id, id), eq(media.userId, ctx.userId)))
		.run();
	return gone.changes > 0;
}

/**
 * How many pictures a piece of writing carries.
 *
 * Counted from the text rather than from a join table, because that is where
 * the truth is: a picture is in an entry when the entry says `![…](/media/12)`,
 * and deleting the line is how you take it out again.
 */
export function referencedIn(content: string): number[] {
	const ids = new Set<number>();
	for (const match of content.matchAll(/!\[[^\]]*\]\(\/media\/(\d+)\)/g)) ids.add(Number(match[1]));
	return [...ids];
}

/** Refuse writing that has gone over the instance's per-entry ceiling. */
export function assertEntryWithinLimit(content: string): void {
	const limits = mediaLimits();
	const count = referencedIn(content).length;
	if (count > limits.entryImages)
		throw new ValidationError(
			`An entry here holds at most ${limits.entryImages} pictures, and that one has ${count}.`
		);
}

// ── A person's face ──────────────────────────────────────────────────────────
//
// One picture, not a gallery: a second photograph of the same person answers no
// question the first did not.
//
// The column is nulled by hand rather than by the database. SQLite's
// `ALTER TABLE … ADD COLUMN … REFERENCES` cannot carry an `ON DELETE` action, so
// the constraint is the default one — which would refuse to delete a picture a
// person still points at instead of letting go of it. Doing it here is also
// where it belongs: whether the bytes go depends on whether anything *else*
// still wants them.

function assertOwnsPerson(ctx: Ctx, personId: number): void {
	const found = db
		.select({ id: people.id })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError({ key: 'errors.media.noSuchPerson' });
}

/** Give somebody a face, replacing whatever was there. */
export async function setPersonPicture(
	ctx: Ctx,
	personId: number,
	input: { bytes: Uint8Array; filename?: string; alt?: string }
): Promise<Picture> {
	assertOwnsPerson(ctx, personId);

	const previous = db
		.select({ pictureId: people.pictureId })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.userId, ctx.userId)))
		.get()?.pictureId;

	const picture = await store(ctx, input);
	db.update(people)
		.set({ pictureId: picture.id })
		.where(and(eq(people.id, personId), eq(people.userId, ctx.userId)))
		.run();

	// The one it replaced, if nothing else is using it.
	if (previous && previous !== picture.id) removeIfUnreferenced(ctx, previous);
	return picture;
}

export function removePersonPicture(ctx: Ctx, personId: number): void {
	assertOwnsPerson(ctx, personId);

	const current = db
		.select({ pictureId: people.pictureId })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.userId, ctx.userId)))
		.get()?.pictureId;
	if (!current) return;

	db.update(people)
		.set({ pictureId: null })
		.where(and(eq(people.id, personId), eq(people.userId, ctx.userId)))
		.run();
	removeIfUnreferenced(ctx, current);
}

// ── A notebook's picture ─────────────────────────────────────────────────────

function assertOwnsNotebook(ctx: Ctx, notebookId: number): void {
	const found = db
		.select({ id: notebooks.id })
		.from(notebooks)
		.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError({ key: 'errors.media.noSuchNotebook' });
}

/**
 * Give a notebook a picture, replacing whatever was there.
 *
 * The same shape a person's face has, and for the same reason: one picture,
 * because it is what the notebook *is*, and the one it replaces goes if nothing
 * else refers to it.
 */
export async function setNotebookPicture(
	ctx: Ctx,
	notebookId: number,
	input: { bytes: Uint8Array; filename?: string; alt?: string }
): Promise<Picture> {
	assertOwnsNotebook(ctx, notebookId);

	const previous = db
		.select({ pictureId: notebooks.pictureId })
		.from(notebooks)
		.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, ctx.userId)))
		.get()?.pictureId;

	const picture = await store(ctx, input);
	db.update(notebooks)
		.set({ pictureId: picture.id })
		.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, ctx.userId)))
		.run();

	if (previous && previous !== picture.id) removeIfUnreferenced(ctx, previous);
	return picture;
}

export function removeNotebookPicture(ctx: Ctx, notebookId: number): void {
	assertOwnsNotebook(ctx, notebookId);

	const current = db
		.select({ pictureId: notebooks.pictureId })
		.from(notebooks)
		.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, ctx.userId)))
		.get()?.pictureId;
	if (!current) return;

	db.update(notebooks)
		.set({ pictureId: null })
		.where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, ctx.userId)))
		.run();
	removeIfUnreferenced(ctx, current);
}

// ── A recipe's gallery ───────────────────────────────────────────────────────

export type RecipePicture = Picture & { position: number; isMain: boolean };

export function picturesOf(ctx: Ctx, recipeId: number): RecipePicture[] {
	return db
		.select({
			id: media.id,
			mime: media.mime,
			filename: media.filename,
			alt: media.alt,
			byteSize: media.byteSize,
			createdAt: media.createdAt,
			position: recipeImages.position,
			isMain: recipeImages.isMain
		})
		.from(recipeImages)
		.innerJoin(media, eq(media.id, recipeImages.mediaId))
		.where(and(eq(recipeImages.userId, ctx.userId), eq(recipeImages.recipeId, recipeId)))
		.orderBy(recipeImages.position, recipeImages.id)
		.all();
}

/** The one picture that stands for each of these recipes, by recipe id. */
export function mainPictures(ctx: Ctx, recipeIds: number[]): Map<number, number> {
	if (recipeIds.length === 0) return new Map();
	const rows = db
		.select({ recipeId: recipeImages.recipeId, mediaId: recipeImages.mediaId })
		.from(recipeImages)
		.where(and(eq(recipeImages.userId, ctx.userId), eq(recipeImages.isMain, true)))
		.all();
	const wanted = new Set(recipeIds);
	return new Map(rows.filter((r) => wanted.has(r.recipeId)).map((r) => [r.recipeId, r.mediaId]));
}

function assertOwnsRecipe(ctx: Ctx, recipeId: number): void {
	const found = db
		.select({ id: recipes.id })
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError({ key: 'errors.media.noSuchRecipe' });
}

/**
 * Put a picture in a recipe's gallery.
 *
 * The first one is the main one without being asked: a gallery of one whose
 * single picture is not the one the list shows would be a bug nobody would
 * think to report.
 */
export async function attachToRecipe(
	ctx: Ctx,
	recipeId: number,
	input: { bytes: Uint8Array; filename?: string; alt?: string }
): Promise<RecipePicture> {
	assertOwnsRecipe(ctx, recipeId);

	const limits = mediaLimits();
	const already = picturesOf(ctx, recipeId);
	if (already.length >= limits.recipeImages)
		throw new ValidationError(
			`A recipe here holds at most ${limits.recipeImages} pictures. Remove one first.`
		);

	const picture = await store(ctx, input);

	if (already.some((p) => p.id === picture.id))
		throw new ValidationError({ key: 'errors.media.thatPictureIsAlready' });

	db.insert(recipeImages)
		.values({
			userId: ctx.userId,
			recipeId,
			mediaId: picture.id,
			position: already.length,
			isMain: already.length === 0,
			createdAt: stamp(ctx)
		})
		.run();

	return { ...picture, position: already.length, isMain: already.length === 0 };
}

/** Take one out, and take the bytes with it when nothing else wants them. */
export function detachFromRecipe(ctx: Ctx, recipeId: number, mediaId: number): void {
	assertOwnsRecipe(ctx, recipeId);

	const gone = db
		.delete(recipeImages)
		.where(
			and(
				eq(recipeImages.userId, ctx.userId),
				eq(recipeImages.recipeId, recipeId),
				eq(recipeImages.mediaId, mediaId)
			)
		)
		.run();
	if (gone.changes === 0)
		throw new NotFoundError({ key: 'errors.media.noSuchPictureOnThisRecipe' });

	// The gallery keeps a main one as long as it has anything in it.
	const left = picturesOf(ctx, recipeId);
	if (left.length > 0 && !left.some((p) => p.isMain)) setMain(ctx, recipeId, left[0].id);

	removeIfUnreferenced(ctx, mediaId);
}

/**
 * Which one the list shows.
 *
 * Two statements, and the clearing has to come first: the database holds "one
 * main per recipe" as a unique index, so setting the new one before clearing
 * the old one is a constraint failure rather than a swap.
 */
export function setMain(ctx: Ctx, recipeId: number, mediaId: number): void {
	assertOwnsRecipe(ctx, recipeId);

	const target = db
		.select({ id: recipeImages.id })
		.from(recipeImages)
		.where(
			and(
				eq(recipeImages.userId, ctx.userId),
				eq(recipeImages.recipeId, recipeId),
				eq(recipeImages.mediaId, mediaId)
			)
		)
		.get();
	if (!target) throw new NotFoundError({ key: 'errors.media.noSuchPictureOnThisRecipe' });

	db.transaction((tx) => {
		tx.update(recipeImages)
			.set({ isMain: false })
			.where(and(eq(recipeImages.userId, ctx.userId), eq(recipeImages.recipeId, recipeId)))
			.run();
		tx.update(recipeImages).set({ isMain: true }).where(eq(recipeImages.id, target.id)).run();
	});
}
