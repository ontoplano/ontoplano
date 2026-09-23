/**
 * Where an inventory row posts, on each screen that shows one.
 *
 * The same component draws the row in Inventory and inside a notebook, and the
 * two routes cannot use the same action names — a notebook page already
 * answers to `delete` for the notebook itself. So the names are a prop, as the
 * goals, ideas, bills, habits and workouts already do.
 */
export type ItemActionNames = {
	setQty: string;
	toggleBought: string;
	toggleSnoozed: string;
	remove: string;
};

/** The Inventory room, where a thing is what the page is about. */
export const ITEM_ROOM_ACTIONS: ItemActionNames = {
	setQty: '?/setQty',
	toggleBought: '?/toggleBought',
	toggleSnoozed: '?/toggleSnoozed',
	remove: '?/delete'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_ITEM_ACTIONS: ItemActionNames = {
	setQty: '?/itemSetQty',
	toggleBought: '?/itemToggleBought',
	toggleSnoozed: '?/itemToggleSnoozed',
	remove: '?/itemDelete'
};
