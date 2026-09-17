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
