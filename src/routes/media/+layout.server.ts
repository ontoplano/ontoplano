import type { IsolatedEvent } from '$lib/isolated/routes';
import { getHiddenSections } from '$lib/services/settings';
import { buildCtx } from '$lib/services/ctx';

/**
 * What the account has put away, so the strip can honour it.
 *
 * Both tabs here are things somebody may not want: a person who never records
 * anything should not carry a Recordings tab, and the Gallery was hideable
 * long before this room existed. The shell's copy of the hidden list does not
 * reach in here, so the room asks for its own.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return { hiddenSections: getHiddenSections(ctx.userId) };
};
