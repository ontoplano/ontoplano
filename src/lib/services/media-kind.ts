/**
 * Which kind of thing a `media` row is.
 *
 * One table holds both, because it is one question — bytes belonging to an
 * account, with a name, a size and a hash — and because an account's storage
 * is one number whatever it is spent on. What differs is every surface: a
 * gallery draws pictures, a recordings list plays recordings, and neither may
 * see the other's rows.
 *
 * The discriminator is the mime, which is not a claim: it is written from what
 * `sniff` proved the bytes to be. So there is nothing to keep in step with a
 * separate column, and a row cannot be one kind by its type and another by its
 * label.
 *
 * Named here rather than written as `like(media.mime, 'image/%')` wherever it
 * is needed. A filter spelled out at nine call sites is a filter that gets
 * forgotten at the tenth, and the tenth is a recordings row rendering as a
 * broken picture in somebody's gallery.
 */
export const IMAGE_MIME_PREFIX = 'image/';
export const AUDIO_MIME_PREFIX = 'audio/';

export function isImageMime(mime: string): boolean {
	return mime.startsWith(IMAGE_MIME_PREFIX);
}

export function isAudioMime(mime: string): boolean {
	return mime.startsWith(AUDIO_MIME_PREFIX);
}

/**
 * Telling bytes what they are.
 *
 * A format is known by its first bytes, never by the name or type it arrived
 * with — a claim is not proof, and a row's kind is written from what the
 * bytes proved. Pictures and recordings each keep their own table of
 * signatures; the reading of one is the same.
 */
export type Signature = { mime: string; extension: string; matches: (b: Uint8Array) => boolean };

/** Do these bytes start with exactly this run of bytes? */
export const startsWithBytes = (b: Uint8Array, at: number, expected: number[]) =>
	expected.every((byte, i) => b[at + i] === byte);

/** The ASCII a run of bytes spells, for the formats whose marker is a word. */
export const asciiAt = (b: Uint8Array, from: number, to: number) =>
	String.fromCharCode(...b.subarray(from, to));

/** Fewer bytes than this is nothing: no format says itself in less. */
const SNIFF_MIN_BYTES = 12;

/** What these bytes are, by this table, or nothing. */
export function sniffer(signatures: readonly Signature[]) {
	return (bytes: Uint8Array): { mime: string; extension: string } | null => {
		if (bytes.length < SNIFF_MIN_BYTES) return null;
		const hit = signatures.find((s) => s.matches(bytes));
		return hit ? { mime: hit.mime, extension: hit.extension } : null;
	};
}
