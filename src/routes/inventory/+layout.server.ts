import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { pickableNotebooks } from '$lib/services/notebooks';
import { host } from '$lib/services/host';
import { recipesByItem } from '$lib/services/recipes';
import { listAttributes } from '$lib/services/attributes';
import { listLocations, locationTree } from '$lib/services/locations';
import { getCurrency, getPanelWidth, LOCATION_PANEL_WIDTH_KEY } from '$lib/services/settings';
import { listCategories, listItems, shoppingRun } from '$lib/services/inventory';

/**
 * What the whole room needs, for both of its lists.
 *
 * Stock and Wishlist are two readings of one cupboard — the same things, the
 * same places, the same categories — so the query belongs to the room rather
 * than to either tab, and moving between them costs nothing.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		// The subject a thing belongs to, asked in the room's own form: the
		// notebook's tab opens this same form with its own notebook chosen.
		notebooks: pickableNotebooks(ctx),
		items: listItems(ctx),
		// What a trip to the shop actually looks like: see `shoppingRun`.
		run: shoppingRun(ctx),
		// The other axis the same rows are read on: where each thing lives.
		locationTree: locationTree(ctx),
		locations: listLocations(ctx),
		/** Which recipes use each item — the other half of the ingredient link. */
		usedIn: recipesByItem(ctx),
		inventoryCategories: listCategories(ctx),
		currency: getCurrency(ctx.userId),
		// Where the handle between the panel and the list was left.
		locationPanelRem: getPanelWidth(ctx.userId, LOCATION_PANEL_WIDTH_KEY),
		// Whether the share-with-family switch has anybody to share with.
		onFamilyPlan: host.familyUserIds(ctx.userId).length > 1,
		// What the things say about themselves, for the Attributes screen and for
		// the filters — both are lists of what has actually been typed.
		attributes: listAttributes(ctx)
	};
};
