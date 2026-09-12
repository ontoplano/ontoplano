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
