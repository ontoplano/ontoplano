/**
 * Where a room's rows post, on whichever screen is drawing them.
 *
 * A room's list is now drawn in two places: the room itself, and the tab for
 * that module inside a notebook. The same component draws both, and the two
 * routes cannot use the same action names — a notebook page already answers to
 * `delete` and `update` for the notebook itself. So the names are a prop the
 * component is handed rather than something its markup spells out.
 *
 * `$lib/todo-actions` wrote this out by hand for one room, twice, and getting
 * a second room's set wrong is a form that posts to an action nobody defined
 * and fails at runtime with nothing to read. This derives both sets from one
 * list of verbs, and `$lib/services/scoped-actions` mounts the handlers under
 * exactly the names it produces.
 */

/** `create` under the prefix `habit` is `habitCreate` — one rule, both sides. */
export function scopedName(prefix: string, verb: string): string {
	return prefix ? `${prefix}${verb[0].toUpperCase()}${verb.slice(1)}` : verb;
}

/**
 * The `?/…` each verb posts to.
 *
 * An empty prefix is the room's own page, where the verbs keep their plain
 * names; a prefix is anywhere else the same rows are drawn.
 */
export function actionsFor<const V extends readonly string[]>(
	verbs: V,
	prefix = ''
): Record<V[number], string> {
	return Object.fromEntries(verbs.map((verb) => [verb, `?/${scopedName(prefix, verb)}`])) as Record<
		V[number],
		string
	>;
}
