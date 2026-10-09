/**
 * Markdown as the words it renders to, for a line of context rather than a page.
 *
 * A search result or a preview quotes somebody's writing in a single line of
 * small text, where `**`, `# ` and `[x](/media/12)` are noise the reader has
 * to see past. This keeps the words and drops the marks: a link keeps its
 * text, a picture its description, a code span its contents. It is not a
 * renderer — nothing here produces markup — so its output is always safe to
 * put in a text node.
 */
export function plainMarkdown(text: string): string {
	return (
		text
			// Fences and HTML tags carry no words of their own.
			.replace(/^\s*(```|~~~).*$/gm, '')
			.replace(/<\/?[a-z][^>]*>/gi, '')
			// A picture is its description; a link is its text.
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			// Line starts: headings, quotes, list bullets and task boxes, numbers.
			.replace(/^\s{0,3}#{1,6}\s+/gm, '')
			.replace(/^\s*>\s?/gm, '')
			.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
			.replace(/^\s*[-*+]\s+/gm, '')
			.replace(/^\s*\d+[.)]\s+/gm, '')
			// Rules and table furniture.
			.replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
			.replace(/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/gm, '')
			.replace(/\s*\|\s*/g, ' ')
			// Emphasis, strike and code spans keep what they wrap.
			.replace(/(\*\*|__)(.+?)\1/g, '$2')
			.replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?=[^\w*]|$)/g, '$1$2')
			.replace(/~~(.+?)~~/g, '$1')
			.replace(/`([^`]*)`/g, '$1')
	);
}

/**
 * The first line of some markdown that has words in it, as words — what a
 * block's notes are called where there is room for one line: the grid, a
 * card, the "Next" widget. Empty when there are no words at all.
 */
export function firstPlainLine(text: string): string {
	return (
		plainMarkdown(text)
			.split('\n')
			.map((line) => line.trim())
			.find(Boolean) ?? ''
	);
}
