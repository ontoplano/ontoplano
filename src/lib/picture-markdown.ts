/**
 * How a picture appears inside something written, and how to take it back out.
 *
 * The sibling of `audio-markdown.ts`, for the same reason and with the same
 * bargain: an ordinary markdown image is the right thing to *store* — an
 * export, another editor or a plain renderer all still show something that
 * works — and the wrong thing to show on a row, where
 * `![screenshot](/media/12)` is the address of a picture standing where the
 * picture should be.
 *
 * Kept apart from the audio one because the two paths overlap: a recording is
 * `/media/audio/40` and a picture is `/media/12`, so a pattern loose enough to
 * catch one catches the other. The `!` and the digits straight after `/media/`
 * are what tell them apart.
 */
export const PICTURE_HREF = '/media';

/** The line that carries picture `id` into somebody's writing. */
export function pictureMarkdown(id: number, alt: string): string {
	const label = alt.replace(/[[\]]/g, ' ').trim();
	return `![${label || `picture ${id}`}](${PICTURE_HREF}/${id})`;
}

/**
 * The writing, and the pictures in it, apart.
 *
 * `!\[…\]` is required, so a plain link to a picture is left in the text as a
 * link — somebody who typed one meant a link. `(\d+)` immediately after
 * `/media/` is what keeps `/media/audio/40` out of this.
 */
export function splitPictures(content: string): { text: string; pictures: number[] } {
	const pictures: number[] = [];
	const pattern = new RegExp(`!\\[[^\\]]*\\]\\(${PICTURE_HREF}/(\\d+)\\)`, 'g');
	const text = content
		.replace(pattern, (_, id) => {
			const found = Number(id);
			if (!pictures.includes(found)) pictures.push(found);
			return '';
		})
		// The line the picture was on is now empty, and two of those in a row
		// are a hole in the middle of a paragraph.
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return { text, pictures };
}
