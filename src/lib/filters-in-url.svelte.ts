import { page } from '$app/state';
import { goto } from '$app/navigation';
import { isNarrowed, readFilters, writeFilters, type Filters } from './filters-query.js';

/**
 * A list's narrowing, kept in the address.
 *
 * The tag filter has lived there for a while — see `tag-filter-url` — and the
 * rest of the task list's answers did not: whether completed ones show,
 * whether put-away ones do, which notebook. So a filtered list was a thing you
 * could see and not a thing you could send, a reload threw it away, and
 * "favourite filters" had nothing to save.
 *
 * What that buys, in order of how much it matters:
 *
 *   A narrowed list is a link. Bookmark it, send it, come back to it.
 *   A reload keeps what you were looking at.
 *   A saved filter is a name and a query string, and nothing else — no new
 *   table, no shape to keep in step with the controls.
 *
 * **Absent means the default.** A parameter is written only when it differs
 * from what the list does on its own, so an unfiltered list has a clean
 * address and `?` is never a wall of `=false`.
 *
 * **The address is the state.** There is no copy of it here to keep in step:
 * reading is `page.url`, writing is a navigation, and the next read sees what
 * the write did. The first version did mirror it, and the mirror and the
 * address spent their time undoing each other — a press changed the address
 * and the control it was on stayed unpressed.
 *
 * Which is why this writes with `goto(..., { replaceState: true })` rather
 * than with `replaceState` itself: the latter changes the address without
 * `page.url` reliably following, so everything reading `page` carried on
 * describing the list as it was before the press.
 */
export function filtersInUrl(defaults: Filters) {
	const current = $derived(readFilters(page.url.searchParams, defaults));

	function write(next: Filters) {
		const search = writeFilters(page.url.searchParams, defaults, next).toString();
		const href = `${page.url.pathname}${search ? `?${search}` : ''}${page.url.hash}`;
		// The page's own path, already resolved; only the query changes. Neither
		// the scroll nor the focus may move: this is a control being pressed,
		// not somewhere being gone to.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(href, {
			state: page.state,
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	return {
		get(key: string): string {
			return current[key] ?? defaults[key];
		},
		set(key: string, value: string) {
			write({ ...current, [key]: value });
		},
		/** Everything back to what the list does on its own. */
		clear() {
			write({ ...defaults });
		},
		/** Whether any of them is saying something other than the default. */
		get narrowed(): boolean {
			return isNarrowed(current, defaults);
		}
	};
}
