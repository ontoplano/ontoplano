import { redirect } from '@sveltejs/kit';
import { inventoryActions } from './actions';

/**
 * The room's address, which is now a pair of them.
 *
 * Inventory is two lists — the cupboard and the wishlist — and each is a tab
 * with a page of its own. This is the name everything already points at:
 * bookmarks, the search, a link in a recipe, the installed shell. Opening it
 * goes to the cupboard, which is what the room is mostly for.
 */
export const load = async () => {
	redirect(307, '/inventory/stock');
};

/*
 * And it still answers for the room's forms.
 *
 * The capture pie posts a thing to `/inventory?/create` from wherever somebody
 * happens to be standing, and a form that has been in the wild cannot be moved
 * by renaming a directory. The handlers are the same ones both tabs mount.
 */
export const actions = inventoryActions;
