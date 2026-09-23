import type { Actions } from '@sveltejs/kit';
import { scopedName } from '../scoped-actions.js';

/**
 * A room's handlers, mounted under a prefix.
 *
 * The notebook page answers for every module it can hold, and each module's
 * handlers are the room's own — the Habits tab inside a notebook ticks a habit
 * with the same code the Health room does, or the two screens mean different
 * things by the same button. The plain names belong to the notebook itself, so
 * they are mounted prefixed: `create` becomes `habitCreate`.
 *
 * The prefix is applied by `scopedName`, the same function the markup's action
 * names come from, so a form and its handler cannot disagree about the name.
 */
export function under(prefix: string, handlers: Actions): Actions {
	return Object.fromEntries(
		Object.entries(handlers).map(([verb, handler]) => [scopedName(prefix, verb), handler])
	);
}
