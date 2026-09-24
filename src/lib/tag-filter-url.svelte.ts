import { page } from '$app/state';
import { replaceState } from '$app/navigation';
import { tagFilterFromQuery, writeTagFilter, type TagFilter } from '$lib/tag-filter';

/**
 * A tag filter kept in the address, so a reload or a shared link comes back
 * narrowed the same way.
 *
 * Written with a shallow `replaceState`: the list is already on the page and
 * is filtered where it is, so nothing needs loading again, and a filter is not
 * somewhere Back should step through one label at a time.
 */
export function tagFilterInUrl() {
	let current = $state<TagFilter>(tagFilterFromQuery(page.url.searchParams));

	return {
		get current(): TagFilter {
			return current;
		},
		set current(next: TagFilter) {
			current = next;
			const search = writeTagFilter(page.url.searchParams, next).toString();
			const href = `${page.url.pathname}${search ? `?${search}` : ''}${page.url.hash}`;
			try {
				// The page's own path, already resolved; only the query changes.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				replaceState(href, page.state);
			} catch {
				// Before the router has started there is no history to write to;
				// the filter still holds for this visit.
			}
		}
	};
}
