/**
 * How a recording appears inside something written.
 *
 * One shape, named once, because three places have to agree about it: the
 * endpoint that stores a recording and hands back the line to paste, the
 * attach button that writes it into a textarea, and the renderer that turns it
 * back into a player. A link spelled slightly differently in any of them is a
 * recording that renders as a link to a file.
 *
 * It is an ordinary markdown link on purpose. Anything that reads this text
 * without knowing about recordings — an export, another editor, a plain
 * markdown renderer — still shows something that works.
 */
export const AUDIO_HREF = '/media/audio';

/** The line that carries recording `id` into somebody's writing. */
export function audioMarkdown(id: number, name: string): string {
	// Square brackets in a name would close the link early; the name is only a
	// label, so the ones that would break it are spaces.
	const label = name.replace(/[[\]]/g, ' ').trim();
	return `[${label || `recording ${id}`}](${AUDIO_HREF}/${id})`;
}

/**
 * The writing, and the recordings in it, apart.
 *
 * A markdown link is the right thing to *store* — an export, another editor or
 * a plain renderer all still show something that works — and the wrong thing
 * to *show*: a line reading `[my great idea, in audio](/media/audio/40)` in the
 * middle of somebody's writing is the file name of a recording where the
 * recording should be. So anywhere the text is drawn as text rather than run
 * through the markdown renderer, this takes the links out and hands back the
 * ids, to be drawn as players under it.
 */
export function splitAudio(content: string): { text: string; audios: number[] } {
	const audios: number[] = [];
	const pattern = new RegExp(`\\[[^\\]]*\\]\\(${AUDIO_HREF}/(\\d+)\\)`, 'g');
	const text = content
		.replace(pattern, (_, id) => {
			const found = Number(id);
			if (!audios.includes(found)) audios.push(found);
			return '';
		})
		// The line the link was on is now an empty one, and two of those in a row
		// are a gap in the middle of a paragraph.
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return { text, audios };
}

/** Every recording a piece of writing refers to, in the order it mentions them. */
export function audioReferencedIn(content: string): number[] {
	const found = new Set<number>();
	const pattern = new RegExp(`\\]\\(${AUDIO_HREF}/(\\d+)\\)`, 'g');
	for (const hit of content.matchAll(pattern)) found.add(Number(hit[1]));
	return [...found];
}
