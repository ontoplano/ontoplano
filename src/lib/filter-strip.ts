/**
 * What a `FilterBar` tells the controls inside it.
 *
 * Whether the strip is folded — too narrow for its filters to sit out in it —
 * so a control that has a compact form (the order, `SortControl`) can take it
 * without every room passing the same flag down by hand.
 */
import { getContext, setContext } from 'svelte';

const KEY = Symbol('filter-strip');

export type FilterStrip = { readonly folded: boolean };

export function setFilterStrip(strip: FilterStrip): void {
	setContext(KEY, strip);
}

/** The strip this control sits in, or nothing when it is not in one. */
export function getFilterStrip(): FilterStrip | undefined {
	return getContext<FilterStrip | undefined>(KEY);
}
