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

/** Every recording a piece of writing refers to, in the order it mentions them. */
export function audioReferencedIn(content: string): number[] {
	const found = new Set<number>();
	const pattern = new RegExp(`\\]\\(${AUDIO_HREF}/(\\d+)\\)`, 'g');
	for (const hit of content.matchAll(pattern)) found.add(Number(hit[1]));
	return [...found];
}
