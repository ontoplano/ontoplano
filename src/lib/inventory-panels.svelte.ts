/**
 * The Inventory room's two management screens, opened from its title line.
 *
 * Categories and Attributes describe the whole room rather than the tab on
 * screen, so their buttons sit with the room's own buttons beside its name
 * (`routes/inventory/+layout.svelte`), while the dialogs themselves live with
 * the state they edit in `InventoryRoom`. This is the switch the two share.
 */
export const inventoryPanels = $state({ categories: false, attributes: false });
