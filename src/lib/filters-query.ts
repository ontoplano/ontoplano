/**
 * A list's narrowing, as the address spells it.
 *
 * The pure half of `$lib/filters-in-url`: reading a set of parameters out of a
 * query and writing them back into one. Here rather than beside the state
 * because a `URLSearchParams` built and mutated inside a `.svelte.ts` is a
 * reactivity trap the linter is right to refuse — and because what a filter
 * means is worth testing without a page around it.
 */

/** What a list can be narrowed by, as the address spells it. */
export type Filters = Record<string, string>;

/** The values this list uses, taken from a query. Absent means the default. */
export function readFilters(params: URLSearchParams, defaults: Filters): Filters {
	const out: Filters = { ...defaults };
	for (const key of Object.keys(defaults)) {
		const given = params.get(key);
		if (given !== null) out[key] = given;
	}
	return out;
}

/**
 * The same query with this list's answers written into it.
 *
 * Anything outside `defaults` is left alone: the tag filter writes its own
 * parameters into the same address and the two must not tread on each other.
 * A value that matches its default is deleted rather than written, so an
 * unfiltered list has a clean address instead of a wall of `=`.
 */
export function writeFilters(
	params: URLSearchParams,
	defaults: Filters,
	next: Filters
): URLSearchParams {
	const out = new URLSearchParams(params);
	for (const [key, fallback] of Object.entries(defaults)) {
		if ((next[key] ?? fallback) === fallback) out.delete(key);
		else out.set(key, next[key]);
	}
	return out;
}

/** Whether any of them is saying something other than the default. */
export function isNarrowed(current: Filters, defaults: Filters): boolean {
	return Object.keys(defaults).some((key) => current[key] !== defaults[key]);
}
