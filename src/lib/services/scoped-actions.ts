import type { Actions } from '@sveltejs/kit';

/**
 * A room's handlers, mounted under a prefix.
 *
 * The notebook page answers for every module it can hold, and each module's
 * handlers are the room's own — the Habits tab inside a notebook ticks a habit
 * with the same code the Health room does, or the two screens mean different
 * things by the same button. The plain names belong to the notebook itself, so
 * they are mounted prefixed: `create` becomes `habitCreate`.
 *
 * What the markup posts to is the matching `*-action-names.ts` beside each
 * card — `$lib/habit-action-names`, `$lib/bill-action-names` and the rest —
 * which spell the same names out for the two screens that draw the card.
 */
export function under(prefix: string, handlers: Actions): Actions {
	return Object.fromEntries(
		Object.entries(handlers).map(([verb, handler]) => [
			`${prefix}${verb[0].toUpperCase()}${verb.slice(1)}`,
			handler
		])
	);
}
