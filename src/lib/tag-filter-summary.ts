import { UNTAGGED, type TagFilter } from '$lib/tag-filter';

/**
 * What a tag filter is doing, as the words a folded filter button wears —
 * `#home`, `−#work`, and the untagged choice under its own name.
 */
export function tagFilterWords(filter: TagFilter, untagged: string): string[] {
	const word = (one: string) => (one === UNTAGGED ? untagged : `#${one}`);
	return [...filter.include.map(word), ...filter.exclude.map((one) => `−${word(one)}`)];
}
