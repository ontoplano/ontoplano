/**
 * Narrowing a list by its labels: some to keep, some to drop, and whether
 * the ones to keep must all be there or any one will do.
 *
 * Shared by the screens that filter by tag, the service that answers the same
 * question in SQL and the MCP listings, so "carries #home but not #done" means
 * one thing wherever it is asked.
 *
 * "Untagged" is written as the empty string. No label can be spelled that way
 * — `parseTags` drops empty words — so it can sit in either list beside real
 * names without a second field for it. As something to keep it means "carries
 * no label"; as something to drop, "carries at least one".
 */

export type TagMode = 'any' | 'all';

export const TAG_MODES: readonly TagMode[] = ['any', 'all'];

/** The one entry that is not a label: a thing carrying none. */
export const UNTAGGED = '';

export type TagFilter = {
	/** Keep what satisfies these — one of them, or all, by `mode`. */
	include: string[];
	/** Drop anything satisfying any of these, whatever `mode` says. */
	exclude: string[];
	mode: TagMode;
};

export const NO_TAG_FILTER: TagFilter = { include: [], exclude: [], mode: 'any' };

/** The query parameters a filter is written into, so it survives a reload. */
export const TAG_QUERY = { include: 'tag', exclude: 'nottag', mode: 'tagmode' } as const;

/** Whether this filter narrows anything at all. */
export function isTagFiltering(filter: TagFilter): boolean {
	return filter.include.length > 0 || filter.exclude.length > 0;
}

/** Whether one entry of a filter holds for a thing carrying these labels. */
function holds(entry: string, labels: readonly string[]): boolean {
	return entry === UNTAGGED ? labels.length === 0 : labels.includes(entry);
}

/** Whether a thing carrying these labels gets through. */
export function passesTagFilter(labels: readonly string[], filter: TagFilter): boolean {
	if (filter.exclude.some((entry) => holds(entry, labels))) return false;
	if (filter.include.length === 0) return true;
	return filter.mode === 'all'
		? filter.include.every((entry) => holds(entry, labels))
		: filter.include.some((entry) => holds(entry, labels));
}

/** A label as somebody typed it: lower case, no leading hashes, trimmed. */
function word(raw: string): string {
	return raw.replace(/^#+/, '').trim().toLowerCase();
}

/**
 * The filter a URL describes.
 *
 * A name in both lists is kept only as an exclusion — asking for something
 * and its absence at once is a mistake somebody made in the address bar, and
 * dropping is the reading that shows them less rather than more.
 */
export function tagFilterFromQuery(params: URLSearchParams): TagFilter {
	const exclude = [...new Set(params.getAll(TAG_QUERY.exclude).map(word))];
	const include = [...new Set(params.getAll(TAG_QUERY.include).map(word))].filter(
		(one) => !exclude.includes(one)
	);
	const mode = params.get(TAG_QUERY.mode) === 'all' ? 'all' : 'any';
	return { include, exclude, mode };
}

/** Writes a filter into a URL's query, leaving every other parameter alone. */
export function writeTagFilter(params: URLSearchParams, filter: TagFilter): URLSearchParams {
	const out = new URLSearchParams(params);
	out.delete(TAG_QUERY.include);
	out.delete(TAG_QUERY.exclude);
	out.delete(TAG_QUERY.mode);
	for (const one of filter.include) out.append(TAG_QUERY.include, one);
	for (const one of filter.exclude) out.append(TAG_QUERY.exclude, one);
	// `any` is the default, so it is left out rather than written into every link.
	if (filter.mode === 'all') out.set(TAG_QUERY.mode, 'all');
	return out;
}
