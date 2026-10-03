/**
 * What Enter does on a line of a list, in a box that is written in Markdown.
 *
 * The way every editor that knows lists does it: Enter at the end of `- [ ] milk`
 * starts the next line with `- [ ] `, a bullet with a bullet and a number with
 * the next number; and Enter on a line that is nothing but the marker ends the
 * list, taking the marker off rather than adding another. Anything else is an
 * ordinary new line, which is the browser's and not this.
 */

/** Indent, the marker, and a tick box if the line has one. */
const LIST_LINE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;

/** Replace `from`–`to` with `text`; the caret lands at the end of it. */
export type Continued = { from: number; to: number; text: string };

/**
 * The edit Enter makes at `start`, or null when Enter should do what it
 * always does. A selection is left to the browser too.
 */
export function continueList(value: string, start: number, end: number = start): Continued | null {
	if (start !== end) return null;
	const lineStart = value.lastIndexOf('\n', start - 1) + 1;
	const lineEndAt = value.indexOf('\n', start);
	const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
	const line = value.slice(lineStart, lineEnd);
	const found = LIST_LINE.exec(line);
	if (!found) return null;

	const [marker, indent, bullet, gap, box] = found;
	// The caret inside the marker itself: not a list continuation.
	if (start - lineStart < marker.length) return null;

	// Only the marker on the line: Enter ends the list.
	if (line.trim() === marker.trim()) {
		return { from: lineStart, to: lineEnd, text: '' };
	}

	const numbered = /^(\d+)([.)])$/.exec(bullet);
	const next = numbered ? `${Number(numbered[1]) + 1}${numbered[2]}` : bullet;
	const inserted = `\n${indent}${next}${gap}${box ? '[ ] ' : ''}`;
	return { from: start, to: start, text: inserted };
}
