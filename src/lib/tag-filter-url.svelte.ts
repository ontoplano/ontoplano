import { page } from '$app/state';
import { goto } from '$app/navigation';
import { tagFilterFromQuery, writeTagFilter, type TagFilter } from '$lib/tag-filter';

/**
 * A tag filter kept in the address, so a reload or a shared link comes back
 * narrowed the same way.
 *
 * **The address is the state**, and there is no copy of it here. There was
 * one: `current` was `$state`, seeded from the URL the first time the control
 * was drawn and never read again. A press updated the copy and the copy wrote
 * the address, which worked for as long as the control was the only thing
 * moving — and failed the moment anything else navigated. Applying a saved
 * filter did exactly that: the address changed, every other control followed
 * it, and the labels stayed where they were until the page was loaded again.
 * Which is what "clicking a saved filter does nothing" was.
 *
 * `$lib/filters-in-url` is the sibling that had already learned this, down to
 * the reason for the write below: a bare `replaceState` changes the address
 * without `page.url` reliably following, so `goto(…, { replaceState: true })`
 * is what keeps the read and the write talking about the same thing. It is
 * still a replace — a filter is not somewhere Back should step through one
 * label at a time — and neither the scroll nor the focus moves, because this
 * is a control being pressed rather than somewhere being gone to.
 */
export function tagFilterInUrl() {
	const current = $derived(tagFilterFromQuery(page.url.searchParams));

	return {
		get current(): TagFilter {
			return current;
		},
		set current(next: TagFilter) {
			const search = writeTagFilter(page.url.searchParams, next).toString();
			const href = `${page.url.pathname}${search ? `?${search}` : ''}${page.url.hash}`;
			// The page's own path, already resolved; only the query changes.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(href, {
				state: page.state,
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
		}
	};
}
