/**
 * How a notebook's title says where it belongs.
 *
 * `Home — Kitchen` is a notebook inside a notebook: the separator IS the
 * relationship, the same way it is for albums. Written down here rather than
 * beside the notebooks service so a page can use it without pulling the
 * database in behind it.
 */
export const NOTEBOOK_SEPARATOR = ' — ';

/** A notebook's own name, without the lineage in front of it. */
export function leafNotebookName(title: string): string {
	return title.split(NOTEBOOK_SEPARATOR).at(-1) ?? title;
}

/** Everything in front of that name: the notebook it sits inside, or ''. */
export function parentNotebookPath(title: string): string {
	const parts = title.split(NOTEBOOK_SEPARATOR);
	parts.pop();
	return parts.join(NOTEBOOK_SEPARATOR);
}

/**
 * A full title from the two halves a form asks for.
 *
 * The place is the name — that is what makes renaming a notebook the way to
 * move it — but typing an em dash is not something anybody should have to
 * know, so the form asks for the name and the notebook it goes inside and
 * this puts them back together.
 */
export function joinNotebookPath(parent: string, leaf: string): string {
	return parent ? `${parent}${NOTEBOOK_SEPARATOR}${leaf}` : leaf;
}

/** Whether `title` is `ancestor` itself or somewhere inside it. */
export function isInsideNotebook(title: string, ancestor: string): boolean {
	return title === ancestor || title.startsWith(ancestor + NOTEBOOK_SEPARATOR);
}
