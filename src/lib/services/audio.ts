/**
 * Recordings: what is accepted, where they go, and who may hear one.
 *
 * The same three rules `media.ts` states for pictures, for the same reasons —
 * the type comes from the bytes, nothing is stored under a name the sender
 * chose, and the ceilings are the instance's and are enforced here rather than
 * in a form. What differs is the allowlist and the numbers.
 *
 * **Containers, not codecs.** A browser's `MediaRecorder` hands back WebM or
 * MP4 depending on which browser it is, and neither is negotiable from here.
 * Both are containers whose first bytes are unmistakable, so the check is the
 * same shape as a picture's: read the head, match it, refuse everything else.
 * What is *inside* the container is not inspected and does not need to be —
 * the bytes are returned with an `audio/*` content type and a
 * `Content-Disposition` that forbids the browser treating them as a document,
 * so a file that lies about its insides plays as noise rather than running.
 *
 * **A recording is not a picture.** It lives in the same table, because it is
 * the same question — bytes belonging to an account, with a name and a size —
 * but every surface that draws pictures asks for `image/*` and every surface
 * that plays recordings asks for `audio/*`. Neither can see the other's rows.
 *
 * Nothing here is the server's, for the same reason nothing in `media.ts` is:
 * the digest is WebCrypto's and the ceilings arrive through `host`, so an
 * instance running on a phone stores a recording the same way.
 */
import { and, eq, like, sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { media } from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { sha256Hex } from './digest.js';
import { NotFoundError, ValidationError } from './errors.js';
import { host } from './host.js';
import { AUDIO_MIME_PREFIX } from './media-kind.js';
import type { MediaLimits } from './media-limits.js';
import { stamp } from './time.js';

/** Do these bytes start with exactly this run of bytes? */
const starts = (b: Uint8Array, at: number, expected: number[]) =>
	expected.every((byte, i) => b[at + i] === byte);

/** The ASCII a run of bytes spells, for the containers marked with a word. */
const ascii = (b: Uint8Array, from: number, to: number) =>
	String.fromCharCode(...b.subarray(from, to));

/**
 * What a recording may be, and how its first bytes look.
 *
 * Four containers, and between them every browser that can record at all.
 * Chromium and Firefox produce WebM with Opus inside; Safari produces MP4 with
 * AAC; Ogg is what an older Firefox produces and what a person is most likely
 * to have on a disk. MP3 is here because a file somebody already has is very
 * often one.
 *
 * WebM is Matroska, so the marker is the EBML header rather than anything
 * saying "webm" — which is also why a Matroska *video* would pass this and be
 * stored as a recording. That is the right trade: the container is the same
 * one, the bytes are served as audio, and refusing it would mean parsing the
 * track table of every upload to find out what is in it.
 */
const SIGNATURES: { mime: string; extension: string; matches: (b: Uint8Array) => boolean }[] = [
	{
		mime: 'audio/webm',
		extension: 'webm',
		matches: (b) => starts(b, 0, [0x1a, 0x45, 0xdf, 0xa3])
	},
	{
		mime: 'audio/ogg',
		extension: 'ogg',
		matches: (b) => ascii(b, 0, 4) === 'OggS'
	},
	{
		mime: 'audio/mp4',
		extension: 'm4a',
		matches: (b) => ascii(b, 4, 8) === 'ftyp'
	},
	{
		mime: 'audio/mpeg',
		extension: 'mp3',
		matches: (b) =>
			// An ID3 tag, or a bare frame header: eleven set bits, then a version
			// and layer that are not the reserved values.
			ascii(b, 0, 3) === 'ID3' ||
			(b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x18) !== 0x08 && (b[1] & 0x06) !== 0)
	}
];

/** The list a file input may advertise. Not a check — the check is the bytes. */
export const ACCEPTED_AUDIO_TYPES = SIGNATURES.map((s) => s.mime);

/** Also not a check, for the same reason `media.ts` says it is not. */
export const ACCEPTED_AUDIO_EXTENSIONS = [...SIGNATURES.map((s) => s.extension), 'oga', 'mp4'];

/**
 * The longest name a recording may be given.
 *
 * Shorter than a filename's, because this one is typed rather than carried in
 * from a disk, and a line somebody types is a line that has to fit in a list.
 */
export const MAX_AUDIO_NAME_LENGTH = 120;

export type Recording = {
	id: number;
	mime: string;
	name: string;
	byteSize: number;
	createdAt: string;
};

export function audioLimits(): MediaLimits {
	return host.mediaLimits();
}

/** Only rows that are recordings. Every query here is scoped by it. */
const isRecording = like(media.mime, `${AUDIO_MIME_PREFIX}%`);

export function sniffAudio(bytes: Uint8Array): { mime: string; extension: string } | null {
	if (bytes.length < 12) return null;
	const hit = SIGNATURES.find((s) => s.matches(bytes));
	return hit ? { mime: hit.mime, extension: hit.extension } : null;
}

/**
 * What a recording is called when nobody says.
 *
 * The moment it was made, which is the one thing about an unnamed recording
 * that distinguishes it from the others — and the format sorts the same way it
 * reads. The placeholder in the form is this exact string, so leaving the
 * field alone and typing what it already shows are the same act.
 */
export function defaultAudioName(at: Date, tz: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(at);
	const of = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? '00';
	// `en-CA` gives 24 as midnight in some runtimes; the clock here is 00–23.
	const hour = of('hour') === '24' ? '00' : of('hour');
	return `${of('year')}-${of('month')}-${of('day')}.${hour}:${of('minute')}:${of('second')}`;
}

/**
 * Tidy a name somebody typed.
 *
 * Control characters out, whitespace collapsed, length capped. Not a path and
 * never used as one — the bytes are served by row id — so the only rules are
 * the ones that keep a list readable.
 */
export function tidyAudioName(raw: string): string {
	return (
		raw
			// eslint-disable-next-line no-control-regex -- the point is to remove them
			.replace(/[\u0000-\u001f\u007f]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, MAX_AUDIO_NAME_LENGTH)
	);
}

/** How many recordings this account already keeps. */
export function countStored(ctx: Ctx): number {
	const [row] = db
		.select({ held: sql<number>`count(*)` })
		.from(media)
		.where(and(eq(media.userId, ctx.userId), isRecording))
		.all();
	return row?.held ?? 0;
}

/**
 * Take a recording in.
 *
 * Everything a caller sends is a claim: the bytes are checked against the
 * allowlist, the name is rewritten rather than trusted, the mime is the one
 * the bytes proved rather than the one the request declared, and both ceilings
 * are counted from the database rather than from anything sent.
 */
export async function store(
	ctx: Ctx,
	input: { bytes: Uint8Array; name?: string }
): Promise<Recording> {
	const limits = audioLimits();

	if (!input.bytes || input.bytes.length === 0)
		throw new ValidationError('That recording was empty.');
	if (input.bytes.length > limits.audioBytes)
		throw new ValidationError(
			`Recordings here are at most ${limits.audioKilobytes}KB, and that one is ${Math.ceil(
				input.bytes.length / 1024
			)}KB.`
		);

	const kind = sniffAudio(input.bytes);
	if (!kind) throw new ValidationError('That is not a recording this instance takes.');

	const sha256 = await sha256Hex(input.bytes);
	const existing = db
		.select()
		.from(media)
		.where(and(eq(media.userId, ctx.userId), eq(media.sha256, sha256)))
		.get();
	if (existing) return toRecording(existing);

	// Counted only once this one is known to be new, for the reason `media.ts`
	// gives: storing something already stored costs nothing.
	if (countStored(ctx) >= limits.accountAudios)
		throw new ValidationError(
			`That is ${limits.accountAudios} recordings already. Delete one to keep another.`
		);

	const name = tidyAudioName(input.name ?? '') || defaultAudioName(ctx.now, ctx.tz);

	const row = db
		.insert(media)
		.values({
			userId: ctx.userId,
			mime: kind.mime,
			// The column a picture keeps its filename in. A recording has no
			// file it came from, so this is the name somebody gave it.
			filename: name,
			alt: '',
			byteSize: input.bytes.length,
			bytes: input.bytes as Buffer,
			sha256,
			createdAt: stamp(ctx)
		})
		.returning()
		.get();

	return toRecording(row);
}

function toRecording(row: typeof media.$inferSelect): Recording {
	return {
		id: row.id,
		mime: row.mime,
		name: row.filename,
		byteSize: row.byteSize,
		createdAt: row.createdAt
	};
}

/**
 * The bytes, for the one account they belong to.
 *
 * Scoped in the `WHERE` and by kind, so somebody else's id and a picture's id
 * are both a 404: not found, not yours and not a recording are one answer.
 */
export function read(ctx: Ctx, id: number): { mime: string; name: string; bytes: Uint8Array } {
	const row = db
		.select()
		.from(media)
		.where(and(eq(media.id, id), eq(media.userId, ctx.userId), isRecording))
		.get();
	if (!row) throw new NotFoundError('No such recording.');
	return { mime: row.mime, name: row.filename, bytes: new Uint8Array(row.bytes) };
}

export function list(ctx: Ctx): Recording[] {
	return db
		.select()
		.from(media)
		.where(and(eq(media.userId, ctx.userId), isRecording))
		.orderBy(sql`${media.createdAt} desc, ${media.id} desc`)
		.all()
		.map(toRecording);
}

export function rename(ctx: Ctx, id: number, name: unknown): Recording {
	const tidy = tidyAudioName(String(name ?? ''));
	if (!tidy) throw new ValidationError('A recording needs a name.');

	const row = db
		.update(media)
		.set({ filename: tidy })
		.where(and(eq(media.id, id), eq(media.userId, ctx.userId), isRecording))
		.returning()
		.get();
	if (!row) throw new NotFoundError('No such recording.');
	return toRecording(row);
}

export function remove(ctx: Ctx, id: number): void {
	const row = db
		.delete(media)
		.where(and(eq(media.id, id), eq(media.userId, ctx.userId), isRecording))
		.returning()
		.get();
	if (!row) throw new NotFoundError('No such recording.');
}
